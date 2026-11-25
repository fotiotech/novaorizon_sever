import "dotenv/config";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const region =
  process.env.AWS_SECRET_REGION || process.env.AWS_REGION || "us-east-1";
const name = process.env.AWS_SECRET_NAME || "novaorizon";

console.log("[check-secret]", {
  region,
  name,
  accessKey: process.env.AWS_ACCESS_KEY_ID
    ? `${process.env.AWS_ACCESS_KEY_ID.slice(0, 4)}…`
    : "(none)",
});

try {
  const client = new SecretsManagerClient({ region });
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: name }),
  );
  const parsed = JSON.parse(res.SecretString || "{}");
  console.log("[check-secret] OK — keys:", Object.keys(parsed));
} catch (err) {
  console.error("[check-secret] FAILED:", err?.name, err?.message);
  process.exitCode = 1;
}
