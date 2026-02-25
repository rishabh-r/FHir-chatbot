package com.carebridge.model;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

public class ChatRequest {

    /** Full conversation history sent from the frontend */
    private List<JsonNode> messages;

    /** FHIR Bearer token – obtained at login, managed by the frontend */
    private String fhirToken;

    public List<JsonNode> getMessages() { return messages; }
    public void setMessages(List<JsonNode> messages) { this.messages = messages; }

    public String getFhirToken() { return fhirToken; }
    public void setFhirToken(String fhirToken) { this.fhirToken = fhirToken; }
}
