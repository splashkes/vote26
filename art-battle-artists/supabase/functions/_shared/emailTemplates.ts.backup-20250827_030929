// Email templates for artist notifications

export const emailTemplates = {
  // Artist application confirmation email
  applicationReceived: (data: {
    artistName: string
    eventEid: string
    eventName: string
    eventDate: string
    eventVenue: string
    cityName: string
  }) => ({
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
  artistInvited: (data: {
    artistName: string
    eventEid: string
    eventName: string
    eventDate: string
    eventVenue: string
    cityName: string
  }) => ({
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
  artistConfirmed: (data: {
    artistName: string
    eventEid: string
    eventName: string
    eventDate: string
    eventVenue: string
    cityName: string
    artistNumber: string
  }) => ({
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
  artistCancelled: (data: {
    artistName: string
    eventEid: string
    eventName: string
    eventDate: string
    eventVenue: string
    cityName: string
    cancellationDate: string
  }) => ({
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
  }),

  // Artist payment notification email (post-event)
  paymentNotification: (data: {
    artistName: string
    eventEid: string
    eventName: string
    eventDate: string
    eventVenue: string
    cityName: string
    soldArtworks: Array<{
      art_code: string
      sale_price: number
      payment_status: string
      round: number
      easel: number
    }>
    noBidArtworks?: string[]
    totalEarned: number
    eventLink: string
    paymentMethodText: string
    hasUnpaidSales: boolean
    detailedArtworkList: string
  }) => ({
    subject: data.soldArtworks.length > 0 
      ? `Art Battle ${data.cityName} - Payment Information Required ($${data.totalEarned} owed)`
      : `Art Battle ${data.cityName} - Thank you for participating!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <div style="background: #e74c3c; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">🎨 Art Battle</h1>
        </div>
        
        <div style="padding: 30px 20px;">
          <h2 style="color: #e74c3c; margin-top: 0;">
            ${data.soldArtworks.length > 0 
              ? `🎉 Congratulations on Your Sale${data.soldArtworks.length > 1 ? 's' : ''}!`
              : '🎨 Thank You for Participating!'
            }
          </h2>
          
          <p>Hello <strong>${data.artistName}</strong>,</p>
          
          <p>Thank you for participating in Art Battle ${data.cityName}! ${data.soldArtworks.length > 0 
            ? `Congratulations on the sale of your painting${data.soldArtworks.length > 1 ? 's' : ''}. We are thrilled that you were able to showcase your skills and share your art with our community.`
            : 'Thank you for showcasing your artistic talents and contributing to the vibrant energy of our event.'
          }</p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #e74c3c;">
            <h3 style="margin-top: 0; color: #e74c3c;">📅 Event Details:</h3>
            <p style="margin: 8px 0;"><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</p>
            <p style="margin: 8px 0;"><strong>Date:</strong> ${data.eventDate}</p>
            <p style="margin: 8px 0;"><strong>Location:</strong> ${data.eventVenue}</p>
            <p style="margin: 8px 0;"><strong>City:</strong> ${data.cityName}</p>
          </div>

          ${data.soldArtworks.length > 0 ? `
            <div style="background: #d4edda; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #28a745;">
              <h3 style="margin-top: 0; color: #155724;">💰 Your Sales Summary:</h3>
              ${data.soldArtworks.map(artwork => `
                <div style="margin: 12px 0; padding: 12px; background: white; border-radius: 6px; border-left: 3px solid #28a745;">
                  <p style="margin: 4px 0;"><strong>${artwork.art_code}</strong> (Round ${artwork.round}, Easel ${artwork.easel})</p>
                  <p style="margin: 4px 0;">Sale Price: <strong>$${artwork.sale_price}</strong></p>
                  <p style="margin: 4px 0;">Buyer Payment: <span style="color: ${artwork.payment_status.includes('PAID') ? '#28a745' : '#dc3545'};">${artwork.payment_status}</span></p>
                </div>
              `).join('')}
              <div style="background: #28a745; color: white; padding: 15px; border-radius: 6px; text-align: center; margin-top: 15px;">
                <h4 style="margin: 0; font-size: 18px;">Your Share: $${data.totalEarned}</h4>
                <p style="margin: 5px 0 0 0; font-size: 14px; opacity: 0.9;">50% of total sales</p>
              </div>
            </div>

            ${data.hasUnpaidSales ? `
              <div style="background: #fff3cd; padding: 20px; border-radius: 8px; margin: 25px 0; border-left: 4px solid #ffc107;">
                <h3 style="margin-top: 0; color: #856404;">💳 Payment Information Required:</h3>
                <div style="white-space: pre-line; line-height: 1.6;">${data.paymentMethodText}</div>
              </div>
            ` : ''}

            <div style="background: #e8f4fd; padding: 20px; border-radius: 8px; margin: 25px 0;">
              <h3 style="margin-top: 0; color: #0066cc;">⏰ Payment Timeline:</h3>
              <p>Please be aware that payments typically make their way to you within <strong>7 to 10 days</strong> after the event. If you would like to change your payment method or if you have any questions, please let us know.</p>
            </div>
          ` : ''}

          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="margin-top: 0; color: #666;">🖼️ View Your Artwork:</h3>
            <p>We have provided a link to your paintings for your record or to share with others:</p>
            <div style="text-align: center; margin: 15px 0;">
              <a href="${data.eventLink}" 
                 style="background: #e74c3c; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; font-weight: bold; 
                        display: inline-block;">
                View Event & Artworks
              </a>
            </div>
          </div>
          
          <p style="margin: 30px 0 20px 0;">Thank you for your participation in Art Battle ${data.cityName}. We look forward to seeing you back at the easel soon.</p>
          
          <p style="margin: 0;"><strong>Best regards,</strong><br>Art Battle HQ<br>Art Battle Artist Payments</p>
          
          <p style="color: #666; font-size: 14px; margin-top: 20px;">Questions? Reply to this email or contact us at hello@artbattle.com</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 15px 20px; text-align: center; color: #666; font-size: 12px;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </div>
      </div>
    `,
    text: `
Art Battle - ${data.soldArtworks.length > 0 ? 'Payment Information Required' : 'Thank You!'}

Hello ${data.artistName},

Thank you for participating in Art Battle ${data.cityName}! ${data.soldArtworks.length > 0 
  ? `Congratulations on the sale of your painting${data.soldArtworks.length > 1 ? 's' : ''}. We are thrilled that you were able to showcase your skills and share your art with our community.`
  : 'Thank you for showcasing your artistic talents and contributing to the vibrant energy of our event.'
}

Event Details:
- Event: ${data.eventEid} - ${data.eventName}
- Date: ${data.eventDate}
- Location: ${data.eventVenue}
- City: ${data.cityName}

${data.soldArtworks.length > 0 ? `
Your Sales Summary:
${data.soldArtworks.map(artwork => 
  `- ${artwork.art_code} (Round ${artwork.round}, Easel ${artwork.easel}) - SOLD for $${artwork.sale_price} - Buyer ${artwork.payment_status}`
).join('\n')}

Your Share: $${data.totalEarned} (50% of total sales)

${data.hasUnpaidSales ? `
Payment Information Required:
${data.paymentMethodText}
` : ''}

Payment Timeline:
Please be aware that payments typically make their way to you within 7 to 10 days after the event. If you would like to change your payment method or if you have any questions, please let us know.
` : ''}

View Your Artwork:
We have provided a link to your paintings for your record or to share with others:
${data.eventLink}

Thank you for your participation in Art Battle ${data.cityName}. We look forward to seeing you back at the easel soon.

Best regards,
Art Battle HQ
Art Battle Artist Payments

Questions? Reply to this email or contact us at hello@artbattle.com

Art Battle - Live Competitive Painting Events
artbattle.com
    `
  })
};