package com.carebridge;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class CareBridgeApplication {
    public static void main(String[] args) {
        SpringApplication.run(CareBridgeApplication.class, args);
    }
}
