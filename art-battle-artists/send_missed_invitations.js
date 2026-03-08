#!/usr/bin/env node

// Send missed invitation emails for today's failed invitations
const invitations = [
  { name: "Erik White", email: "erik@erikwhite.com", event: "AB3041", eventName: "Art Battle Grand Rapids", city: "Grand Rapids" },
  { name: "James Sutherlin", email: "jsutherlin09161987@gmail.com", event: "AB3041", eventName: "Art Battle Grand Rapids", city: "Grand Rapids" },
  { name: "Suzanne Werder", email: "artallthethings@gmail.com", event: "AB3037", eventName: "Art Battle Pittsburgh", city: "Pittsburgh" },
  { name: "Simon Plashkes", email: "simon@plashkes.com", event: "AB3049", eventName: "Art Battle Melbourne", city: "Melbourne" },
  { name: "Simon Plashkes", email: "simon@plashkes.com", event: "AB3001", eventName: "AB3001 – Sydney", city: "Sydney" },
  { name: "Tuvshintugs (Jaz) Batchuluun", email: "jamesbatbold4@gmail.com", event: "AB3001", eventName: "AB3001 – Sydney", city: "Sydney" }
];

const JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IktOUTlNUm5mRGxERWZwUlYiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3hzcWRrdWJneXF3cHl2Zmx0bnJmLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJhMzdhYjg0OC00Yzc2LTRiOTQtOTUyMS1hMGQ2MDU3MzMwN2YiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzU3MDI3NTk5LCJpYXQiOjE3NTcwMDk1OTksImVtYWlsIjoibG9naW5AYXJ0YmF0dGxlLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWV9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzU3MDA5NTk5fV0sInNlc3Npb25faWQiOiIxYjg5MzlhMS1kOTYzLTQxYzktYmFiNy1kZjVhOTc0OGY2YjUiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.KBWH6M2z3KwX8pY1lCcu75WOfmKB6A26eSt9ud9p4o0";

async function sendInvitationEmail(invitation) {
  const emailData = {
    to: invitation.email,
    subject: `You're Invited! ${invitation.event} ${invitation.city}`,
    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
      <h1 style="color: #e74c3c; margin: 0 0 20px 0; font-size: 28px;">Art Battle</h1>
      <h2 style="color: #333; margin: 0 0 20px 0;">You're Invited to Paint!</h2>
      <p>Hello <strong>${invitation.name}</strong>,</p>
      <p><strong>Congratulations!</strong> You have been invited to participate in <strong>${invitation.eventName}</strong>.</p>
      <p><strong>Event Details:</strong></p>
      <ul>
        <li><strong>Event:</strong> ${invitation.event} - ${invitation.eventName}</li>
        <li><strong>City:</strong> ${invitation.city}</li>
      </ul>
      <div style="border: 2px solid #e74c3c; padding: 20px; margin: 30px 0;">
        <p style="margin: 0 0 15px 0; font-size: 18px;"><strong>Action Required</strong></p>
        <p style="margin: 0;">You need to <strong>accept this invitation</strong> to confirm your participation. Please log in to your artist dashboard to accept or decline.</p>
      </div>
      <p><a href="https://artb.art/profile" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; display: inline-block; margin: 20px 0;">Accept Invitation</a></p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">Questions? Reply to this email or contact us at artists@artbattle.com</p>
    </div>`,
    text: `You're Invited to Paint!\n\nHello ${invitation.name},\n\nCongratulations! You have been invited to participate in ${invitation.eventName}!\n\nEvent Details:\n- Event: ${invitation.event} - ${invitation.eventName}\n- City: ${invitation.city}\n\nIMPORTANT - ACTION REQUIRED:\nYou need to accept this invitation to confirm your participation.\nPlease log in to your artist dashboard to accept or decline.\n\nAccept your invitation: https://artb.art/profile\n\nQuestions? Reply to this email or contact us at artists@artbattle.com`,
    from: "artists@artbattle.com"
  };

  try {
    const response = await fetch('https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/send-custom-email', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${JWT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    });

    const result = await response.json();
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function sendAllInvitations() {
  console.log(`Sending ${invitations.length} missed invitation emails...`);
  
  for (let i = 0; i < invitations.length; i++) {
    const invitation = invitations[i];
    console.log(`${i + 1}. Sending to ${invitation.name} (${invitation.email}) for ${invitation.event}...`);
    
    const result = await sendInvitationEmail(invitation);
    if (result.success) {
      console.log(`   ✅ Success`);
    } else {
      console.log(`   ❌ Failed: ${result.error}`);
    }
    
    // Small delay between emails
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n📧 All missed invitation emails have been sent!');
}

sendAllInvitations().catch(console.error);