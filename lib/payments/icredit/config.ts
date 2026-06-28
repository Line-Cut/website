export type IcreditMode = "mock" | "test" | "prod";
export type IcreditConfig = { mode: IcreditMode; host: string | null; token: string | null };

const HOSTS: Record<"test" | "prod", string> = {
  test: "https://testicredit.rivhit.co.il",
  prod: "https://icredit.rivhit.co.il",
};

export function getIcreditConfig(
  env: Record<string, string | undefined> = process.env,
): IcreditConfig {
  const raw = env.ICREDIT_MODE;
  const mode: IcreditMode = raw === "test" || raw === "prod" ? raw : "mock";
  if (mode === "mock") return { mode, host: null, token: null };
  return { mode, host: HOSTS[mode], token: env.ICREDIT_GROUP_PRIVATE_TOKEN ?? null };
}
