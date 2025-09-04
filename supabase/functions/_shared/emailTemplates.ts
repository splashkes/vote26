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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
        <h1 style="color: #e74c3c; margin: 0 0 20px 0; font-size: 28px;">Art Battle</h1>
        
        <h2 style="color: #333; margin: 0 0 20px 0;">Application Received</h2>
        
        <p>Hello <strong>${data.artistName}</strong>,</p>
        
        <p>Thank you for applying to participate in <strong>${data.eventName}</strong>.</p>
        
        <p><strong>Event Details:</strong></p>
        <ul>
          <li><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</li>
          <li><strong>Date:</strong> ${data.eventDate}</li>
          <li><strong>Location:</strong> ${data.eventVenue}</li>
          <li><strong>City:</strong> ${data.cityName}</li>
        </ul>
        
        <p><strong>What's Next:</strong></p>
        <ul>
          <li>Our team will review your application</li>
          <li>Check your artist dashboard for updates</li>
        </ul>
        
        <p><a href="https://artb.art/profile" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; display: inline-block; margin: 20px 0;">View Your Dashboard</a></p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">Questions? Reply to this email or contact us at artists@artbattle.com</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="color: #666; font-size: 12px; text-align: center;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </p>
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
- Check your artist dashboard for updates

View your dashboard: https://artb.art/profile

Questions? Reply to this email or contact us at artists@artbattle.com

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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
        <h1 style="color: #e74c3c; margin: 0 0 20px 0; font-size: 28px;">Art Battle</h1>
        
        <h2 style="color: #333; margin: 0 0 20px 0;">You're Invited to Paint!</h2>
        
        <p>Hello <strong>${data.artistName}</strong>,</p>
        
        <p><strong>Congratulations!</strong> You have been invited to participate in <strong>${data.eventName}</strong>.</p>
        
        <p><strong>Event Details:</strong></p>
        <ul>
          <li><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</li>
          <li><strong>Date:</strong> ${data.eventDate}</li>
          <li><strong>Location:</strong> ${data.eventVenue}</li>
          <li><strong>City:</strong> ${data.cityName}</li>
        </ul>
        
        <div style="border: 2px solid #e74c3c; padding: 20px; margin: 30px 0;">
          <p style="margin: 0 0 15px 0; font-size: 18px;"><strong>Action Required</strong></p>
          <p style="margin: 0;">You need to <strong>accept this invitation</strong> to confirm your participation. Please log in to your artist dashboard to accept or decline.</p>
        </div>
        
        <p><a href="https://artb.art/profile" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; display: inline-block; margin: 20px 0;">Accept Invitation</a></p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">Questions? Reply to this email or contact us at artists@artbattle.com</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="color: #666; font-size: 12px; text-align: center;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </p>
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

Questions? Reply to this email or contact us at artists@artbattle.com

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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
        <h1 style="color: #e74c3c; margin: 0 0 20px 0; font-size: 28px;">Art Battle</h1>
        
        <h2 style="color: #333; margin: 0 0 20px 0;">You're Confirmed to Paint!</h2>
        
        <p>Hello <strong>${data.artistName}</strong>,</p>
        
        <p><strong>Excellent!</strong> You are now confirmed to participate in <strong>${data.eventName}</strong>.</p>
        
        <div style="border: 2px solid #e74c3c; padding: 20px; margin: 30px 0; text-align: center;">
          <p style="margin: 0 0 10px 0; font-size: 18px;"><strong>Your Artist Number</strong></p>
          <p style="margin: 0; font-size: 48px; font-weight: bold; color: #e74c3c;">#${data.artistNumber}</p>
          <p style="margin: 10px 0 0 0; font-size: 16px;"><strong>Remember this number - you'll need it at the event!</strong></p>
        </div>
        
        <p><strong>Event Details:</strong></p>
        <ul>
          <li><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</li>
          <li><strong>Date:</strong> ${data.eventDate}</li>
          <li><strong>Location:</strong> ${data.eventVenue}</li>
          <li><strong>City:</strong> ${data.cityName}</li>
          <li><strong>Your Artist Number:</strong> #${data.artistNumber}</li>
        </ul>
        
        <p><strong>Get Ready to Paint:</strong></p>
        <ul>
          <li>Arrive 30 minutes before the event start time</li>
          <li>Bring your artist number (#${data.artistNumber})</li>
          <li>Art supplies will be provided</li>
          <li>Get ready for an amazing creative competition!</li>
        </ul>
        
        <p><a href="https://artb.art/profile" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; display: inline-block; margin: 20px 0;">View Event Details</a></p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">Questions? Reply to this email or contact us at artists@artbattle.com</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="color: #666; font-size: 12px; text-align: center;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </p>
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

Questions? Reply to this email or contact us at artists@artbattle.com

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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
        <h1 style="color: #e74c3c; margin: 0 0 20px 0; font-size: 28px;">Art Battle</h1>
        
        <h2 style="color: #333; margin: 0 0 20px 0;">Participation Cancelled</h2>
        
        <p>Hello <strong>${data.artistName}</strong>,</p>
        
        <p>We have confirmed the cancellation of your participation in <strong>${data.eventName}</strong>.</p>
        
        <p><strong>Cancelled Event Details:</strong></p>
        <ul>
          <li><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</li>
          <li><strong>Date:</strong> ${data.eventDate}</li>
          <li><strong>Location:</strong> ${data.eventVenue}</li>
          <li><strong>City:</strong> ${data.cityName}</li>
          <li><strong>Cancelled On:</strong> ${data.cancellationDate}</li>
        </ul>
        
        <p><strong>We're Sorry to See You Go</strong></p>
        <p>We understand that sometimes plans change. You're always welcome to apply for future Art Battle events! Keep an eye on your dashboard for upcoming events in your area.</p>
        
        <p><a href="https://artb.art/profile" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; display: inline-block; margin: 20px 0;">View Your Dashboard</a></p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">Questions? Reply to this email or contact us at artists@artbattle.com</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="color: #666; font-size: 12px; text-align: center;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </p>
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

Questions? Reply to this email or contact us at artists@artbattle.com

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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
        <h1 style="color: #e74c3c; margin: 0 0 20px 0; font-size: 28px;">Art Battle</h1>
        
        <h2 style="color: #333; margin: 0 0 20px 0;">
          ${data.soldArtworks.length > 0 
            ? `Congratulations on Your Sale${data.soldArtworks.length > 1 ? 's' : ''}!`
            : 'Thank You for Participating!'
          }
        </h2>
        
        <p>Hello <strong>${data.artistName}</strong>,</p>
        
        <p>Thank you for participating in Art Battle ${data.cityName}! ${data.soldArtworks.length > 0 
          ? `Congratulations on the sale of your painting${data.soldArtworks.length > 1 ? 's' : ''}. We are thrilled that you were able to showcase your skills and share your art with our community.`
          : 'Thank you for showcasing your artistic talents and contributing to the vibrant energy of our event.'
        }</p>
        
        <p><strong>Event Details:</strong></p>
        <ul>
          <li><strong>Event:</strong> ${data.eventEid} - ${data.eventName}</li>
          <li><strong>Date:</strong> ${data.eventDate}</li>
          <li><strong>Location:</strong> ${data.eventVenue}</li>
          <li><strong>City:</strong> ${data.cityName}</li>
        </ul>

        ${data.soldArtworks.length > 0 ? `
          <div style="border: 2px solid #e74c3c; padding: 20px; margin: 30px 0;">
            <p style="margin: 0 0 15px 0; font-size: 18px;"><strong>Your Sales Summary</strong></p>
            ${data.soldArtworks.map(artwork => `
              <p style="margin: 8px 0;"><strong>${artwork.art_code}</strong> (Round ${artwork.round}, Easel ${artwork.easel}) - <strong>$${artwork.sale_price}</strong> - ${artwork.payment_status}</p>
            `).join('')}
            <p style="margin: 15px 0 0 0; font-size: 18px;"><strong>Your Share: $${data.totalEarned}</strong> (50% of total sales)</p>
          </div>

          ${data.hasUnpaidSales ? `
            <div style="border: 2px solid #ffc107; padding: 20px; margin: 30px 0;">
              <p style="margin: 0 0 15px 0; font-size: 18px;"><strong>Payment Information Required</strong></p>
              <p style="margin: 0; white-space: pre-line;">${data.paymentMethodText}</p>
            </div>
          ` : ''}

          <p><strong>Payment Timeline:</strong> Payments typically make their way to you within 7 to 10 days after the event. If you would like to change your payment method or if you have any questions, please let us know.</p>
        ` : ''}

        <p><strong>View Your Artwork:</strong> We have provided a link to your paintings for your record or to share with others:</p>
        <p><a href="${data.eventLink}" style="background: #e74c3c; color: white; padding: 12px 24px; text-decoration: none; display: inline-block; margin: 20px 0;">View Event & Artworks</a></p>
        
        <p>Thank you for your participation in Art Battle ${data.cityName}. We look forward to seeing you back at the easel soon.</p>
        
        <p><strong>Best regards,</strong><br>Art Battle HQ<br>Art Battle Artist Payments</p>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">Questions? Reply to this email or contact us at artists@artbattle.com</p>
        
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        
        <p style="color: #666; font-size: 12px; text-align: center;">
          Art Battle - Live Competitive Painting Events<br>
          <a href="https://artbattle.com" style="color: #e74c3c;">artbattle.com</a>
        </p>
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

Questions? Reply to this email or contact us at artists@artbattle.com

Art Battle - Live Competitive Painting Events
artbattle.com
    `
  })
};