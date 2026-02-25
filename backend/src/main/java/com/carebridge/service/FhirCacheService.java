package com.carebridge.service;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory FHIR response cache with a 5-minute TTL.
 * Reduces repeated FHIR calls for the same resource within a session.
 * A background task evicts stale entries every 60 seconds.
 */
@Service
public class FhirCacheService {

    private static final long TTL_MS = 5 * 60 * 1_000L; // 5 minutes

    private final ConcurrentHashMap<String, CachedEntry> cache = new ConcurrentHashMap<>();

    /** Returns cached value for key if present and not expired; otherwise null. */
    public String get(String key) {
        CachedEntry entry = cache.get(key);
        if (entry == null) return null;
        if (System.currentTimeMillis() - entry.timestamp() > TTL_MS) {
            cache.remove(key);
            return null;
        }
        return entry.value();
    }

    /** Stores a value under key. */
    public void put(String key, String value) {
        cache.put(key, new CachedEntry(value, System.currentTimeMillis()));
    }

    /** Runs every 60 seconds to remove expired entries. */
    @Scheduled(fixedDelay = 60_000)
    public void evictExpired() {
        long now = System.currentTimeMillis();
        cache.entrySet().removeIf(e -> now - e.getValue().timestamp() > TTL_MS);
    }

    private record CachedEntry(String value, long timestamp) {}
}
