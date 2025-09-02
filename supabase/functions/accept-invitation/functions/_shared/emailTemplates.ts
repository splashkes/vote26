// Email templates for artist notifications
export const emailTemplates = {
  // Artist application confirmation email
  applicationReceived: (data)=>({
      subject: `Application Received - ${data.eventEid} ${data.cityName}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #e74c3c; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🎨 Art Battle</h1>
        </div>
        
        <div style="padding: 30px 20px;">
          <h2 style="color: #27ae60; margin-top: 0;">✅ Application Received!</h2>
          
          <p>Hello <strong>${data.artistName}</strong>,</p>
          
          <p>Thank you for applying to participate in <strong>${data.eventName}</strong>!</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #e74c3c;">
            <h3 style="margin-top: 0; color: #e74c3c;">Event Details:</h3>
            <p style="margin: 8px 0;"><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</p>
            <p style="margin: 8px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong> ${data.eventVenue}</p>
            <p style="margin: 8px 0;"><strong>City:</strong> ${data.cityName}</p>
          </div>
          
          <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="margin-top: 0; color: #0066cc;">What's Next:</h3>
            <ul style="padding-left: 20px;">
              <li>Our team will review your application</li>
              <li>You'll receive an email with next steps within 2-3 business days</li>
              <li>Check your artist dashboard for updates</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://artb.art/profile" 
               style="background: #e74c3c; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold; 
                      display: inline-block;">
              View Your Dashboard
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">Questions? Reply to this email or contact us at hello@artbattle.com</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px 20px; text-align: center; color: #666; font-size: 12px;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </div>
      </div>
    `,
      text: `
Art Battle - Application Received

Hello ${data.artistName},

Thank you for applying to participate in ${data.eventName}!

Event Details:
- Event: ${data.eventEid} - ${data.eventName}
- Date: ${data.eventDate}
- Location: ${data.eventVenue}
- City: ${data.cityName}

What's Next:
- Our team will review your application
- You'll receive an email with next steps within 2-3 business days
- Check your artist dashboard for updates

View your dashboard: https://artb.art/profile

Questions? Reply to this email or contact us at hello@artbattle.com

Art Battle - Live Competitive Painting Events
artbattle.com
    `
    }),
  // Artist invitation email
  artistInvited: (data)=>({
      subject: `You're Invited! ${data.eventEid} ${data.cityName}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #e74c3c; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🎨 Art Battle</h1>
        </div>
        
        <div style="padding: 30px 20px;">
          <h2 style="color: #e74c3c; margin-top: 0;">🎉 You're Invited to Paint!</h2>
          
          <p>Hello <strong>${data.artistName}</strong>,</p>
          
          <p>Congratulations! You have been invited to participate in <strong>${data.eventName}</strong>!</p>
          
          <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107;">
            <h3 style="margin-top: 0; color: #856404;">🎨 Event Details:</h3>
            <p style="margin: 8px 0;"><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</p>
            <p style="margin: 8px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong> ${data.eventVenue}</p>
            <p style="margin: 8px 0;"><strong>City:</strong> ${data.cityName}</p>
          </div>
          
          <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="margin-top: 0; color: #155724;">Important - Action Required:</h3>
            <p style="margin: 8px 0;">You need to <strong>accept this invitation</strong> to confirm your participation.</p>
            <p style="margin: 8px 0;">Please log in to your artist dashboard to accept or decline.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://artb.art/profile" 
               style="background: #28a745; color: white; padding: 16px 32px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold; 
                      display: inline-block; font-size: 16px;">
              Accept Invitation
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">Questions? Reply to this email or contact us at hello@artbattle.com</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px 20px; text-align: center; color: #666; font-size: 12px;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </div>
      </div>
    `,
      text: `
Art Battle - You're Invited to Paint!

Hello ${data.artistName},

Congratulations! You have been invited to participate in ${data.eventName}!

Event Details:
- Event: ${data.eventEid} - ${data.eventName}
- Date: ${data.eventDate}
- Location: ${data.eventVenue}
- City: ${data.cityName}

IMPORTANT - ACTION REQUIRED:
You need to accept this invitation to confirm your participation.
Please log in to your artist dashboard to accept or decline.

Accept your invitation: https://artb.art/profile

Questions? Reply to this email or contact us at hello@artbattle.com

Art Battle - Live Competitive Painting Events
artbattle.com
    `
    }),
  // Artist confirmation email
  artistConfirmed: (data)=>({
      subject: `Confirmed! ${data.eventEid} ${data.cityName} - Artist #${data.artistNumber}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #28a745; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🎨 Art Battle</h1>
        </div>
        
        <div style="padding: 30px 20px;">
          <h2 style="color: #28a745; margin-top: 0;">🎉 You're Confirmed to Paint!</h2>
          
          <p>Hello <strong>${data.artistName}</strong>,</p>
          
          <p>Excellent! You are now confirmed to participate in <strong>${data.eventName}</strong>!</p>
          
          <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #28a745; text-align: center;">
            <h3 style="margin-top: 0; color: #155724;">Your Artist Number</h3>
            <div style="font-size: 36px; font-weight: bold; color: #28a745; margin: 10px 0;">
              #${data.artistNumber}
            </div>
            <p style="margin-bottom: 0; color: #155724;">Remember this number - you'll need it at the event!</p>
          </div>
          
          <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107;">
            <h3 style="margin-top: 0; color: #856404;">📅 Event Details:</h3>
            <p style="margin: 8px 0;"><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</p>
            <p style="margin: 8px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong> ${data.eventVenue}</p>
            <p style="margin: 8px 0;"><strong>City:</strong> ${data.cityName}</p>
            <p style="margin: 8px 0;"><strong>Your Artist Number:</strong> #${data.artistNumber}</p>
          </div>
          
          <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="margin-top: 0; color: #0066cc;">Get Ready to Paint:</h3>
            <ul style="padding-left: 20px;">
              <li>Arrive 30 minutes before the event start time</li>
              <li>Bring your artist number (#${data.artistNumber})</li>
              <li>Art supplies will be provided</li>
              <li>Get ready for an amazing creative competition!</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://artb.art/profile" 
               style="background: #e74c3c; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold; 
                      display: inline-block;">
              View Event Details
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">Questions? Reply to this email or contact us at hello@artbattle.com</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px 20px; text-align: center; color: #666; font-size: 12px;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </div>
      </div>
    `,
      text: `
Art Battle - You're Confirmed to Paint!

Hello ${data.artistName},

Excellent! You are now confirmed to participate in ${data.eventName}!

YOUR ARTIST NUMBER: #${data.artistNumber}
Remember this number - you'll need it at the event!

Event Details:
- Event: ${data.eventEid} - ${data.eventName}
- Date: ${data.eventDate}
- Location: ${data.eventVenue}
- City: ${data.cityName}
- Your Artist Number: #${data.artistNumber}

Get Ready to Paint:
- Arrive 30 minutes before the event start time
- Bring your artist number (#${data.artistNumber})
- Art supplies will be provided
- Get ready for an amazing creative competition!

View event details: https://artb.art/profile

Questions? Reply to this email or contact us at hello@artbattle.com

Art Battle - Live Competitive Painting Events
artbattle.com
    `
    }),
  // Artist cancellation email
  artistCancelled: (data)=>({
      subject: `Cancellation Confirmed - ${data.eventEid} ${data.cityName}`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #dc3545; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🎨 Art Battle</h1>
        </div>
        
        <div style="padding: 30px 20px;">
          <h2 style="color: #dc3545; margin-top: 0;">Participation Cancelled</h2>
          
          <p>Hello <strong>${data.artistName}</strong>,</p>
          
          <p>We have confirmed the cancellation of your participation in <strong>${data.eventName}</strong>.</p>
          
          <div style="background: #f8d7da; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #dc3545;">
            <h3 style="margin-top: 0; color: #721c24;">Cancelled Event Details:</h3>
            <p style="margin: 8px 0;"><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</p>
            <p style="margin: 8px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong> ${data.eventVenue}</p>
            <p style="margin: 8px 0;"><strong>City:</strong> ${data.cityName}</p>
            <p style="margin: 8px 0;"><strong>Cancelled On:</strong> ${data.cancellationDate}</p>
          </div>
          
          <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="margin-top: 0; color: #0066cc;">We're Sorry to See You Go</h3>
            <p>We understand that sometimes plans change. You're always welcome to apply for future Art Battle events!</p>
            <p>Keep an eye on your dashboard for upcoming events in your area.</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://artb.art/profile" 
               style="background: #6c757d; color: white; padding: 14px 28px; 
                      text-decoration: none; border-radius: 6px; font-weight: bold; 
                      display: inline-block;">
              View Your Dashboard
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">Questions? Reply to this email or contact us at hello@artbattle.com</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px 20px; text-align: center; color: #666; font-size: 12px;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </div>
      </div>
    `,
      text: `
Art Battle - Participation Cancelled

Hello ${data.artistName},

We have confirmed the cancellation of your participation in ${data.eventName}.

Cancelled Event Details:
- Event: ${data.eventEid} - ${data.eventName}
- Date: ${data.eventDate}
- Location: ${data.eventVenue}
- City: ${data.cityName}
- Cancelled On: ${data.cancellationDate}

We're Sorry to See You Go
We understand that sometimes plans change. You're always welcome to apply for future Art Battle events!

Keep an eye on your dashboard for upcoming events in your area.

View your dashboard: https://artb.art/profile

Questions? Reply to this email or contact us at hello@artbattle.com

Art Battle - Live Competitive Painting Events
artbattle.com
    `
    })
};
