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
};

function buildOtpMessage(sms?: HookPayload["sms"]) {
  if (sms?.message && sms.message.trim().length > 0) {
    return sms.message.trim();
  }

  if (sms?.otp && sms.otp.trim().length > 0) {
    return `Your Art Battle verification code is ${sms.otp}`;
  }

  return null;
}

function buildTelnyxPayload(to: string, text: string) {
  const messagingProfileId = Deno.env.get("TELNYX_MESSAGING_PROFILE_ID");
  const fromNumber = Deno.env.get("TELNYX_FROM_NUMBER");

  if (messagingProfileId) {
    return {
      messaging_profile_id: messagingProfileId,
      to,
      text,
    };
  }

  if (fromNumber) {
    return {
      from: fromNumber,
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
    const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET") ??
      Deno.env.get("AUTH_HOOK_SECRET");
    const telnyxApiKey = Deno.env.get("TELNYX_API_KEY");

    if (!hookSecret) {
      throw new Error(
        "SEND_SMS_HOOK_SECRET or AUTH_HOOK_SECRET must be configured",
      );
    }

    if (!telnyxApiKey) {
      throw new Error("TELNYX_API_KEY is not configured");
    }

    const base64Secret = hookSecret.replace("v1,whsec_", "");
    const headers = Object.fromEntries(req.headers);
    const webhook = new Webhook(base64Secret);
    const hookData = webhook.verify(payload, headers) as HookPayload;

    const phone = hookData.user?.phone?.trim();
    const messageBody = buildOtpMessage(hookData.sms);

    if (!phone) {
      throw new Error("Hook payload did not include user.phone");
    }

    if (!messageBody) {
      throw new Error("Hook payload did not include sms.otp or sms.message");
    }

    const telnyxPayload = buildTelnyxPayload(phone, messageBody);

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
        userId: hookData.user?.id,
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
      userId: hookData.user?.id,
      messageId: telnyxData?.data?.id,
      smsType: hookData.sms?.type ?? "unknown",
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
