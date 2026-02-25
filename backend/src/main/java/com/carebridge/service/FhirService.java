package com.carebridge.service;

import com.fasterxml.jackson.databind.JsonNode;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * Executes FHIR R4 API calls for the 6 supported resources.
 * Results are cached by FhirCacheService (5-minute TTL).
 */
@Service
public class FhirService {

    private static final String FHIR_BASE = "https://fhirassist.rsystems.com:481";

    @Autowired private OkHttpClient    httpClient;
    @Autowired private FhirCacheService cache;

    /**
     * Dispatches a tool call to the appropriate FHIR endpoint.
     *
     * @param toolName  OpenAI tool name (e.g. "search_fhir_patient")
     * @param args      Parsed tool arguments
     * @param fhirToken Bearer token obtained at login
     * @return          Raw JSON string from the FHIR server
     */
    public String executeTool(String toolName, JsonNode args, String fhirToken) {
        if ("end_chat".equals(toolName)) {
            return "{\"status\":\"conversation_ended\"}";
        }

        String url = buildUrl(toolName, args);
        if (url == null) {
            return "{\"error\":\"Unknown tool: " + toolName + "\"}";
        }

        // Cache lookup
        String cacheKey = toolName + "::" + url;
        String cached = cache.get(cacheKey);
        if (cached != null) return cached;

        // FHIR HTTP call
        try {
            Request request = new Request.Builder()
                    .url(url)
                    .header("Authorization", "Bearer " + fhirToken)
                    .header("Content-Type", "application/json")
                    .get()
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                String body = response.body() != null ? response.body().string() : "{}";
                if (response.isSuccessful()) {
                    cache.put(cacheKey, body);
                }
                return body;
            }
        } catch (Exception e) {
            return "{\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}";
        }
    }

    // ── URL builders ──────────────────────────────────────────────────────────

    private String buildUrl(String toolName, JsonNode a) {
        return switch (toolName) {
            case "search_fhir_patient" -> buildUrlWithParams(FHIR_BASE + "/baseR4/Patient",
                    "family",        str(a, "FAMILY"),
                    "given",         str(a, "GIVEN"),
                    "email",         str(a, "EMAIL"),
                    "phone",         str(a, "PHONE"),
                    "birthdate",     str(a, "BIRTHDATE"),
                    "_id",           str(a, "PATIENT_ID"));

            case "search_patient_condition" -> buildUrlWithParams(FHIR_BASE + "/baseR4/Condition",
                    "subject",   str(a, "SUBJECT"),
                    "code",      str(a, "CODE"),
                    "encounter", str(a, "ENCOUNTER"));

            case "search_patient_procedure" -> buildUrlWithParams(FHIR_BASE + "/baseR4/Procedure",
                    "subject",   str(a, "SUBJECT"),
                    "code",      str(a, "CODE"),
                    "encounter", str(a, "ENCOUNTER"));

            case "search_patient_medications" -> buildUrlWithParams(FHIR_BASE + "/baseR4/MedicationRequest",
                    "subject",        str(a, "SUBJECT"),
                    "code",           str(a, "CODE"),
                    "prescriptionId", str(a, "PRESCRIPTIONID"));

            case "search_patient_encounter" -> {
                // "date" can appear twice (start + end), so we build manually
                StringBuilder sb = new StringBuilder(FHIR_BASE + "/baseR4/Encounter");
                boolean first = true;
                first = appendParam(sb, "subject", str(a, "SUBJECT"), first);
                first = appendParam(sb, "date",    str(a, "DATE"),    first);
                      appendParam(sb, "date",    str(a, "DATE2"),   first);
                yield sb.toString();
            }

            case "search_patient_observations" -> {
                // IMPORTANT: endpoint is /Observations (plural) – /Observation (singular) returns 500
                int page = a.path("page").isMissingNode() ? 0 : a.path("page").asInt(0);
                String url = buildUrlWithParams(FHIR_BASE + "/baseR4/Observations",
                        "subject",        str(a, "SUBJECT"),
                        "code",           str(a, "CODE"),
                        "value_quantity", str(a, "value_quantity"));
                // Always append page (server requires it)
                yield url + (url.contains("?") ? "&" : "?") + "page=" + page;
            }

            default -> null;
        };
    }

    /**
     * Builds a URL from a base and alternating key/value pairs.
     * Skips pairs where value is null or empty.
     */
    private String buildUrlWithParams(String base, String... kvPairs) {
        StringBuilder sb = new StringBuilder(base);
        boolean first = true;
        for (int i = 0; i < kvPairs.length - 1; i += 2) {
            String key = kvPairs[i];
            String val = kvPairs[i + 1];
            first = appendParam(sb, key, val, first);
        }
        return sb.toString();
    }

    /** Appends ?key=val or &key=val if val is non-empty. Returns new 'first' state. */
    private boolean appendParam(StringBuilder sb, String key, String val, boolean first) {
        if (val == null || val.isBlank()) return first;
        sb.append(first ? "?" : "&").append(key).append("=").append(val);
        return false;
    }

    /** Safely extracts a string value from a JsonNode, defaulting to empty string. */
    private String str(JsonNode node, String field) {
        JsonNode n = node.path(field);
        return n.isMissingNode() || n.isNull() ? "" : n.asText();
    }
}
