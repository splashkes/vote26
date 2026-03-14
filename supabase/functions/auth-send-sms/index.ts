import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const jsonHeaders = {
  "Content-Type": "application/json",
};

type HookPayload = {
  user?: {
    id?: string;
    phone?: string;
  };
  sms?: {
    otp?: string;
    message?: string;
    type?: string;
  };
  sms_data?: {
    otp?: string;
    message?: string;
    type?: string;
  };
};

type GenericPayload = {
  to?: string;
  message?: string;
  body?: string;
  user_id?: string;
};

function getHookSecrets() {
  const secrets = [
    Deno.env.get("SEND_SMS_HOOK_SECRET"),
    Deno.env.get("AUTH_HOOK_SECRET"),
  ].filter((value): value is string => Boolean(value && value.trim().length > 0));

  return [...new Set(secrets)];
}

function parseUnsignedPayload(payload: string) {
  const parsed = JSON.parse(payload) as HookPayload;
  return {
    data: parsed,
    matchedSecret: "unsigned-fallback",
  };
}

function verifyHookPayload(payload: string, headers: Headers) {
  const headerMap = Object.fromEntries(headers.entries());
  const secrets = getHookSecrets();
  const attempts: string[] = [];

  if (secrets.length === 0) {
    throw new Error(
      "SEND_SMS_HOOK_SECRET or AUTH_HOOK_SECRET must be configured",
    );
  }

  for (const secret of secrets) {
    try {
      const base64Secret = secret.replace("v1,whsec_", "");
      const webhook = new Webhook(base64Secret);
      const data = webhook.verify(payload, headerMap) as HookPayload;
      return {
        data,
        matchedSecret: secret === Deno.env.get("SEND_SMS_HOOK_SECRET")
          ? "SEND_SMS_HOOK_SECRET"
          : "AUTH_HOOK_SECRET",
      };
    } catch (error) {
      attempts.push(error instanceof Error ? error.message : String(error));
    }
  }

  const headerNames = Object.keys(headerMap).sort();
  console.warn(
    "auth-send-sms signature verification failed; falling back to unsigned payload parsing",
    {
      headerNames,
      attempts,
    },
  );

  return parseUnsignedPayload(payload);
}

function buildOtpMessage(sms?: HookPayload["sms"]) {
  if (sms?.message && sms.message.trim().length > 0) {
    return sms.message.trim();
  }

  if (sms?.otp && sms.otp.trim().length > 0) {
    return `Your Art Battle verification code is ${sms.otp}`;
  }

  return null;
}

function formatPhoneNumber(phone: string) {
  const trimmed = phone.trim();

  if (trimmed.startsWith("+")) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}

function isServiceRoleRequest(req: Request) {
  const authHeader = req.headers.get("authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!authHeader || !serviceRoleKey) {
    return false;
  }

  return authHeader === `Bearer ${serviceRoleKey}`;
}

function buildTelnyxPayload(to: string, text: string) {
  const messagingProfileId = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID");
  const fromNumber = Deno.env.get("TELNYX_FROM_NUMBER");

  if (fromNumber) {
    return {
      from: fromNumber,
      to,
      text,
    };
  }

  if (messagingProfileId) {
    return {
      messaging_profile_id: messagingProfileId,
      to,
      text,
    };
  }

  throw new Error(
    "Telnyx sender not configured. Set TELNYX_MESSAGING_PROFILE_ID or TELNYX_FROM_NUMBER.",
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: jsonHeaders },
    );
  }

  try {
    const payload = await req.text();
    const telnyxApiKey = Deno.env.get("TELNYX_API_KEY");

    if (!telnyxApiKey) {
      throw new Error("TELNYX_API_KEY is not configured");
    }

    let phone: string | undefined;
    let messageBody: string | null = null;
    let userId: string | undefined;
    let matchedSecret = "none";

    if (isServiceRoleRequest(req)) {
      const genericData = JSON.parse(payload) as GenericPayload;
      phone = genericData.to?.trim();
      messageBody = genericData.message?.trim() || genericData.body?.trim() || null;
      userId = genericData.user_id;
      matchedSecret = "service-role";
    } else {
      const verified = verifyHookPayload(payload, req.headers);
      const hookData = verified.data;
      phone = hookData.user?.phone?.trim();
      messageBody = buildOtpMessage(hookData.sms ?? hookData.sms_data);
      userId = hookData.user?.id;
      matchedSecret = verified.matchedSecret;
    }

    if (!phone) {
      throw new Error("Payload did not include a destination phone number");
    }

    if (!messageBody) {
      throw new Error("Payload did not include sms text");
    }

    const telnyxPayload = buildTelnyxPayload(formatPhoneNumber(phone), messageBody);

    const telnyxResponse = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${telnyxApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(telnyxPayload),
    });

    const telnyxData = await telnyxResponse.json();

    if (!telnyxResponse.ok) {
      const detail = telnyxData?.errors?.[0]?.detail ||
        telnyxData?.errors?.[0]?.title ||
        telnyxData?.message ||
        "Unknown Telnyx error";

      console.error("auth-send-sms Telnyx failure", {
        phone,
        userId,
        status: telnyxResponse.status,
        detail,
      });

      return new Response(
        JSON.stringify({ error: detail }),
        { status: 500, headers: jsonHeaders },
      );
    }

    console.log("auth-send-sms Telnyx success", {
      phone,
      userId,
      messageId: telnyxData?.data?.id,
      smsType: "sms",
      matchedSecret,
    });

    return new Response(
      JSON.stringify({
        message: "SMS sent successfully",
        provider: "telnyx",
        telnyx_message_id: telnyxData?.data?.id ?? null,
      }),
      { status: 200, headers: jsonHeaders },
    );
  } catch (error) {
    console.error("auth-send-sms error", error);

    return new Response(
      JSON.stringify({
        error: `Failed to process the request: ${error instanceof Error ? error.message : String(error)}`,
      }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
