const os = require("os");

function base(fields = {}) {
  return {
    ts: new Date().toISOString(),
    host: os.hostname(),
    service: "famaserv-backend",
    ...fields,
  };
}

function log(level, msg, fields = {}) {
  const entry = base({ level, msg, ...fields });
  // Keep console.* for simplicity; downstream can collect stdout
  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}

function child(bindings = {}) {
  return {
    info: (msg, f = {}) => log("info", msg, { ...bindings, ...f }),
    warn: (msg, f = {}) => log("warn", msg, { ...bindings, ...f }),
    error: (msg, f = {}) => log("error", msg, { ...bindings, ...f }),
  };
}

module.exports = {
  info: (msg, f) => log("info", msg, f),
  warn: (msg, f) => log("warn", msg, f),
  error: (msg, f) => log("error", msg, f),
  child,
};


