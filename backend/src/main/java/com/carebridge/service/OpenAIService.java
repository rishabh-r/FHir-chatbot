package com.carebridge.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.*;
import java.util.concurrent.*;

/**
 * Core service that:
 * 1. Builds the full OpenAI request (system prompt + conversation history + tools)
 * 2. Streams the OpenAI response (SSE) and forwards text deltas to the SseEmitter
 * 3. Executes FHIR tool calls in parallel (CompletableFuture)
 * 4. Loops until OpenAI produces a final text response
 */
@Service
public class OpenAIService {

    private static final String OPENAI_URL = "https://api.openai.com/v1/chat/completions";
    private static final MediaType JSON_MEDIA = MediaType.get("application/json; charset=utf-8");

    @Value("${openai.api.key}")
    private String openAiKey;

    @Value("${openai.model:gpt-4o-mini}")
    private String openAiModel;

    @Autowired private OkHttpClient        httpClient;
    @Autowired private ObjectMapper        mapper;
    @Autowired private SystemPromptService promptService;
    @Autowired private FhirService         fhirService;

    /** Thread pool for parallel FHIR tool calls */
    private final ExecutorService toolExecutor = Executors.newVirtualThreadPerTaskExecutor();

    // ── Static tool definitions (serialised once at class load) ──────────────

    private static final String TOOLS_JSON = """
[
  {
    "type": "function",
    "function": {
      "name": "search_fhir_patient",
      "description": "Search for patients in the FHIR system by name, email, phone, birthdate, or patient ID.",
      "parameters": {
        "type": "object",
        "properties": {
          "GIVEN":      { "type": "string", "description": "Patient first/given name" },
          "FAMILY":     { "type": "string", "description": "Patient last/family name" },
          "EMAIL":      { "type": "string", "description": "Patient email address" },
          "PHONE":      { "type": "string", "description": "Patient phone number" },
          "BIRTHDATE":  { "type": "string", "description": "Patient date of birth (YYYY-MM-DD)" },
          "PATIENT_ID": { "type": "string", "description": "Patient numeric ID" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_patient_condition",
      "description": "Search patient conditions/diagnoses from FHIR. Can search by subject (patient ID) and/or ICD-9 code.",
      "parameters": {
        "type": "object",
        "properties": {
          "SUBJECT":   { "type": "string", "description": "Patient numeric ID (no 'Patient/' prefix)" },
          "CODE":      { "type": "string", "description": "ICD-9 diagnosis code" },
          "ENCOUNTER": { "type": "string", "description": "Encounter numeric ID" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_patient_procedure",
      "description": "Search patient procedures/surgeries from FHIR.",
      "parameters": {
        "type": "object",
        "properties": {
          "SUBJECT":   { "type": "string", "description": "Patient numeric ID" },
          "CODE":      { "type": "string", "description": "CPT procedure code" },
          "ENCOUNTER": { "type": "string", "description": "Encounter numeric ID" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_patient_medications",
      "description": "Search patient medication requests/prescriptions from FHIR.",
      "parameters": {
        "type": "object",
        "properties": {
          "SUBJECT":        { "type": "string", "description": "Patient numeric ID" },
          "CODE":           { "type": "string", "description": "Drug code (e.g. INSULIN, ACET325)" },
          "PRESCRIPTIONID": { "type": "string", "description": "Prescription ID number" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_patient_encounter",
      "description": "Search patient encounters (admissions, discharges, insurance info) from FHIR.",
      "parameters": {
        "type": "object",
        "properties": {
          "SUBJECT": { "type": "string", "description": "Patient numeric ID" },
          "DATE":    { "type": "string", "description": "Start date filter e.g. 'gt2000-01-13'" },
          "DATE2":   { "type": "string", "description": "End date filter e.g. 'lt2024-09-13'" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_patient_observations",
      "description": "Search patient lab results, vitals, and clinical observations from FHIR.",
      "parameters": {
        "type": "object",
        "properties": {
          "SUBJECT":        { "type": "string", "description": "Patient numeric ID" },
          "CODE":           { "type": "string", "description": "LOINC observation code" },
          "value_quantity": { "type": "string", "description": "Filter by value e.g. 'gt10|mEq/L'" },
          "page":           { "type": "number", "description": "Page number starting at 0" }
        }
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "end_chat",
      "description": "End the conversation when the user explicitly indicates they are done.",
      "parameters": {
        "type": "object",
        "properties": {
          "farewell_message": { "type": "string", "description": "Short professional closing message." }
        },
        "required": ["farewell_message"]
      }
    }
  }
]
""";

    private JsonNode toolsNode;

    // Parse the tools JSON once at init time
    @jakarta.annotation.PostConstruct
    private void init() throws Exception {
        toolsNode = mapper.readTree(TOOLS_JSON);
    }

    // ── Public entry point ────────────────────────────────────────────────────

    /**
     * Runs the full agent loop:
     * - Calls OpenAI (streaming)
     * - If tool calls → executes FHIR in parallel → loops
     * - If final text → text already streamed to emitter → sends "done" event
     */
    public void runAgentLoop(List<JsonNode> frontendMessages,
                             String fhirToken,
                             SseEmitter emitter) throws Exception {

        // Build the working message list: system + conversation history
        List<ObjectNode> messages = new ArrayList<>();
        messages.add(systemMessage());
        for (JsonNode msg : frontendMessages) {
            messages.add((ObjectNode) mapper.createObjectNode().setAll((ObjectNode) msg.deepCopy()));
        }

        while (true) {
            // Stream this OpenAI call; text chunks go directly to emitter
            OpenAIResult result = callOpenAI(messages, emitter);

            boolean hasToolCalls = result.toolCalls() != null && !result.toolCalls().isEmpty();

            if (hasToolCalls) {
                // Add assistant message (with tool_calls) to history
                messages.add(buildAssistantMessage(result));

                // Handle end_chat
                Optional<ToolCall> endCall = result.toolCalls().stream()
                        .filter(tc -> "end_chat".equals(tc.name())).findFirst();
                if (endCall.isPresent()) {
                    JsonNode args   = mapper.readTree(endCall.get().arguments());
                    String farewell = args.path("farewell_message")
                            .asText("Thank you for using CareBridge. Have a great day!");
                    // Emit farewell as a text chunk then done
                    emitter.send(SseEmitter.event().name("chunk")
                            .data(mapper.writeValueAsString(Map.of("text", farewell))));
                    emitter.send(SseEmitter.event().name("done").data("{}"));
                    emitter.complete();
                    return;
                }

                // Execute all tool calls in parallel
                List<CompletableFuture<ObjectNode>> futures = result.toolCalls().stream()
                        .map(tc -> CompletableFuture.supplyAsync(() -> {
                            JsonNode args;
                            try { args = mapper.readTree(tc.arguments()); }
                            catch (Exception e) { args = mapper.createObjectNode(); }
                            String toolResult = fhirService.executeTool(tc.name(), args, fhirToken);
                            ObjectNode toolMsg = mapper.createObjectNode();
                            toolMsg.put("role", "tool");
                            toolMsg.put("tool_call_id", tc.id());
                            toolMsg.put("content", toolResult);
                            return toolMsg;
                        }, toolExecutor))
                        .toList();

                // Wait for all FHIR calls to complete
                CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).join();
                for (CompletableFuture<ObjectNode> f : futures) {
                    messages.add(f.get());
                }
                // Continue the loop — next OpenAI call will produce the final response

            } else {
                // Final text response: text was already streamed chunk-by-chunk
                emitter.send(SseEmitter.event().name("done").data("{}"));
                emitter.complete();
                break;
            }
        }
    }

    // ── OpenAI streaming call ─────────────────────────────────────────────────

    /**
     * Makes one streaming OpenAI call.
     * Text chunks are emitted to emitter as they arrive.
     * Tool-call deltas are accumulated and returned in OpenAIResult.
     *
     * Note: when finish_reason is "tool_calls", OpenAI produces NO text content,
     * so the emitter receives nothing during tool-call iterations.
     */
    private OpenAIResult callOpenAI(List<ObjectNode> messages, SseEmitter emitter) throws Exception {
        // Build request body
        ObjectNode body = mapper.createObjectNode();
        body.put("model", openAiModel);
        body.set("messages", mapper.valueToTree(messages));
        body.set("tools", toolsNode);
        body.put("tool_choice", "auto");
        body.put("stream", true);

        Request request = new Request.Builder()
                .url(OPENAI_URL)
                .header("Authorization", "Bearer " + openAiKey)
                .header("Content-Type", "application/json")
                .post(RequestBody.create(mapper.writeValueAsBytes(body), JSON_MEDIA))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                String errBody = response.body() != null ? response.body().string() : "{}";
                JsonNode errJson;
                try { errJson = mapper.readTree(errBody); }
                catch (Exception e) { errJson = mapper.createObjectNode(); }
                String msg = errJson.path("error").path("message").asText("OpenAI API error " + response.code());
                throw new RuntimeException(msg);
            }

            StringBuilder          fullContent  = new StringBuilder();
            Map<Integer, TcBuilder> tcMap        = new LinkedHashMap<>();
            String                  finishReason = null;

            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(response.body().byteStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (!line.startsWith("data: ")) continue;
                    String data = line.substring(6).trim();
                    if ("[DONE]".equals(data)) { break; }
                    if (data.isEmpty()) continue;

                    try {
                        JsonNode parsed = mapper.readTree(data);
                        JsonNode choice = parsed.path("choices").path(0);
                        if (choice.isMissingNode()) continue;

                        // Capture finish_reason
                        String fr = choice.path("finish_reason").asText(null);
                        if (fr != null && !"null".equals(fr)) finishReason = fr;

                        JsonNode delta = choice.path("delta");

                        // Accumulate text and stream to client
                        if (!delta.path("content").isMissingNode()
                                && !delta.path("content").isNull()) {
                            String chunk = delta.path("content").asText();
                            if (!chunk.isEmpty()) {
                                fullContent.append(chunk);
                                // Forward chunk to SSE client
                                emitter.send(SseEmitter.event().name("chunk")
                                        .data(mapper.writeValueAsString(Map.of("text", chunk))));
                            }
                        }

                        // Accumulate tool call deltas
                        JsonNode toolCallsArr = delta.path("tool_calls");
                        if (!toolCallsArr.isMissingNode() && toolCallsArr.isArray()) {
                            for (JsonNode tc : toolCallsArr) {
                                int idx = tc.path("index").asInt(0);
                                TcBuilder builder = tcMap.computeIfAbsent(idx, k -> new TcBuilder());
                                if (tc.has("id"))                       builder.id        += tc.get("id").asText();
                                if (tc.path("function").has("name"))    builder.name      += tc.path("function").get("name").asText();
                                if (tc.path("function").has("arguments")) builder.arguments += tc.path("function").get("arguments").asText();
                            }
                        }
                    } catch (Exception ignored) { /* skip malformed chunks */ }
                }
            }

            List<ToolCall> toolCalls = tcMap.values().stream()
                    .map(b -> new ToolCall(b.id, b.name, b.arguments))
                    .toList();

            if (finishReason == null) {
                finishReason = toolCalls.isEmpty() ? "stop" : "tool_calls";
            }

            return new OpenAIResult(
                    fullContent.isEmpty() ? null : fullContent.toString(),
                    toolCalls.isEmpty()   ? null : toolCalls,
                    finishReason
            );
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private ObjectNode systemMessage() {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("role", "system");
        msg.put("content", promptService.getSystemPrompt());
        return msg;
    }

    private ObjectNode buildAssistantMessage(OpenAIResult result) {
        ObjectNode msg = mapper.createObjectNode();
        msg.put("role", "assistant");
        if (result.content() != null) msg.put("content", result.content());
        else msg.putNull("content");

        ArrayNode tcs = mapper.createArrayNode();
        for (ToolCall tc : result.toolCalls()) {
            ObjectNode tcNode = mapper.createObjectNode();
            tcNode.put("id", tc.id());
            tcNode.put("type", "function");
            ObjectNode func = mapper.createObjectNode();
            func.put("name", tc.name());
            func.put("arguments", tc.arguments());
            tcNode.set("function", func);
            tcs.add(tcNode);
        }
        msg.set("tool_calls", tcs);
        return msg;
    }

    // ── Inner types ───────────────────────────────────────────────────────────

    /** Mutable accumulator for streaming tool-call deltas */
    private static class TcBuilder {
        String id = "", name = "", arguments = "";
    }

    /** Immutable snapshot after all deltas for one tool call are merged */
    private record ToolCall(String id, String name, String arguments) {}

    /** Full result of one OpenAI streaming call */
    private record OpenAIResult(String content, List<ToolCall> toolCalls, String finishReason) {}
}
