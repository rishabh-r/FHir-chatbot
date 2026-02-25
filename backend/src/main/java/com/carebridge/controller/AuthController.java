package com.carebridge.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Proxies login requests to the FHIR authentication server.
 * The frontend never contacts the FHIR server directly for auth.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final String FHIR_LOGIN_URL = "https://fhirassist.rsystems.com:481/auth/login";
    private static final MediaType JSON_TYPE    = MediaType.get("application/json; charset=utf-8");

    @Autowired private OkHttpClient httpClient;
    @Autowired private ObjectMapper objectMapper;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials) {
        try {
            String body = objectMapper.writeValueAsString(credentials);
            Request req = new Request.Builder()
                    .url(FHIR_LOGIN_URL)
                    .post(RequestBody.create(body, JSON_TYPE))
                    .build();

            try (Response resp = httpClient.newCall(req).execute()) {
                String respBody = resp.body() != null ? resp.body().string() : "{}";
                if (!resp.isSuccessful()) {
                    int code = resp.code();
                    String msg = (code == 401 || code == 400)
                            ? "Invalid credentials. Please try again."
                            : "Login failed (" + code + "). Please try again.";
                    return ResponseEntity.status(code).body(Map.of("error", msg));
                }
                JsonNode data = objectMapper.readTree(respBody);
                return ResponseEntity.ok(data);
            }
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", "Login error: " + e.getMessage()));
        }
    }
}
