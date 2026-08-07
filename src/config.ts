export interface Config {
  baseUrl: string;
  adminToken: string;
  registrationSharedSecret?: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

export function loadConfig(): Config {
  const baseUrl = required("DENDRITE_BASE_URL").replace(/\/+$/, "");
  const adminToken = required("DENDRITE_ADMIN_TOKEN");
  const registrationSharedSecret =
    process.env.DENDRITE_REGISTRATION_SHARED_SECRET || undefined;

  return { baseUrl, adminToken, registrationSharedSecret };
}
