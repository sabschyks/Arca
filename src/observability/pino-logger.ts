import pino from "pino";
import type { Logger } from "../types";

export const createPinoLogger = (options?: pino.LoggerOptions): Logger => {
  const instance = pino(
    options || {
      level: "info",
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
  );

  return {
    info: (msg, obj) => instance.info(obj, msg),
    error: (msg, obj) => instance.error(obj, msg),
    debug: (msg, obj) => instance.debug(obj, msg),
    warn: (msg, obj) => instance.warn(obj, msg),
  };
};
