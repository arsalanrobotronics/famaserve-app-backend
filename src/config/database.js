const mongoose = require("mongoose");

if (process.env.ENVIRONMENT.toUpperCase() === "PRODUCTION") {
  const fs = require("fs");
  const connection = mongoose.connection;

  const sslDirectory = process.env.SSL_DIRECTORY;

  if (!sslDirectory) {
    console.log("Secure path not located");
    process.exit(1);
  }

  const tlsCAFile = fs.readFileSync(`${sslDirectory}/ca.pem`);
  const tlsCertificateKeyFile = fs.readFileSync(`${sslDirectory}/client.pem`);

  module.exports = async () => {
    try {
      await mongoose.connect(process.env.MONGO_DB_URI, {
        tls: true,
        tlsCAFile: `${sslDirectory}/ca.pem`,
        tlsCertificateKeyFile: `${sslDirectory}/client.pem`,
        tlsAllowInvalidCertificates: true,
        auth: {
          username: process.env.MONGO_DB_USER,
          password: process.env.MONGO_DB_PASS,
        },
      });
      console.log("Database link established");

      connection.on("disconnected", function () {
        throw new Error("Database link terminated");
      });
    } catch (error) {
      throw new Error(`Database link failed: ${error.message}`);
    }
  };
} else if (process.env.ENVIRONMENT.toUpperCase() === "PRODUCTION-NOSSL") {
  console.log(
    "Production mode without secure layer configured"
  );

  const connection = mongoose.connection;

  module.exports = async () => {
    try {
      await mongoose.connect(process.env.MONGO_DB_URI, {
        auth: {
          username: process.env.MONGO_DB_USER,
          password: process.env.MONGO_DB_PASS,
        },
      });
      console.log("Database link established");

      connection.on("disconnected", function () {
        throw new Error("Database link terminated");
      });
    } catch (error) {
      throw new Error(`Database link failed: ${error.message}`);
    }
  };
} else {
  console.log(
    "Environment value not detected. Using development configuration"
  );

  module.exports = async () => {
    try {
      await mongoose.connect(process.env.MONGO_DB_URI);
      console.log("Database link established");
    } catch (error) {
      throw new Error(`Database link failed: ${error.message}`);
    }
  };
}
