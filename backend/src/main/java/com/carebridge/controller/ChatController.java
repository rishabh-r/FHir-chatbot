package com.carebridge.controller;

import com.carebridge.model.ChatRequest;
import com.carebridge.service.OpenAIService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * POST /api/chat  →  SSE stream of text chunks.
 *
 * Event format (JSON lines):
 *   event: chunk   data: {"text":"..."}          ← text delta
 *   event: done    data: {}                       ← conversation turn finished
 *   event: error   data: {"message":"..."}        ← error
 */
@RestController
@RequestMapping("/api")
public class ChatController {

    @Autowired private OpenAIService openAIService;
    @Autowired private ObjectMapper  objectMapper;

    // Virtual threads (Java 21) – one per request, very lightweight
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter chat(@RequestBody ChatRequest request) {
        SseEmitter emitter = new SseEmitter(180_000L); // 3-minute timeout

        executor.submit(() -> {
            try {
                openAIService.runAgentLoop(
                        request.getMessages(),
                        request.getFhirToken(),
                        emitter
                );
            } catch (Exception e) {
                try {
                    String errJson = objectMapper.writeValueAsString(
                            Map.of("message", e.getMessage() != null ? e.getMessage() : "Unknown error")
                    );
                    emitter.send(SseEmitter.event().name("error").data(errJson));
                } catch (Exception ignored) {}
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }
}
