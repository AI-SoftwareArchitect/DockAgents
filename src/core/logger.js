/**
 * Centralized logging configuration using Winston.
 * Single Responsibility: Only sets up the application logger.
 */

import winston from "winston";
import config from "./config.js";

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, label }) => {
    const lbl = label ? ` ${label.padEnd(30)}` : "";
    return `[${ts}] ${level.padEnd(8)}${lbl} | ${message}`;
});

/**
 * Create a named logger instance.
 * @param {string} name - Logger label / module name.
 * @returns {winston.Logger}
 */
export function getLogger(name) {
    return winston.createLogger({
        level: config.logLevel,
        format: combine(
            timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
            winston.format.label({ label: name }),
            colorize(),
            logFormat
        ),
        transports: [new winston.transports.Console()],
    });
}
