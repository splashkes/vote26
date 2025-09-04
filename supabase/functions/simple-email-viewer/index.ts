import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { emailTemplates } from '../_shared/emailTemplates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const template = url.searchParams.get('template') || 'application'
    
    // Sample data for all templates
    const sampleData = {
      'application': {
        artistName: "Sarah Johnson",
        eventEid: "AB3010",
        eventName: "AB3010 – Vancouver",
        eventStartDateTime: "2025-09-30T02:30:00.000Z", // 7:30 PM Vancouver time
        eventVenue: "The Gallery Downtown",
        cityName: "Vancouver"
      },
      'invitation': {
        artistName: "Mike Chen",
        eventEid: "AB3011",
        eventName: "AB3011 – Calgary", 
        eventStartDateTime: "2025-10-06T01:00:00.000Z", // 7:00 PM Calgary time
        eventVenue: "Arts Commons",
        cityName: "Calgary"
      },
      'confirmation': {
        artistName: "Emma Rodriguez",
        eventEid: "AB3012",
        eventName: "AB3012 – Montreal",
        eventStartDateTime: "2025-10-13T00:00:00.000Z", // 8:00 PM Montreal time
        eventVenue: "Le Studio Art Space",
        cityName: "Montreal",
        artistNumber: "88274"
      },
      'cancellation': {
        artistName: "David Wilson",
        eventEid: "AB3013", 
        eventName: "AB3013 – Halifax",
        eventDate: "Friday, October 18, 2025",
        eventVenue: "Maritime Museum",
        cityName: "Halifax",
        cancellationDate: "October 10, 2025"
      },
      'payment-with-sales': {
        artistName: "Jane Doe",
        eventEid: "AB2995",
        eventName: "AB2995 – Sydney",
        eventDate: "Friday, August 22, 2025",
        eventVenue: "Sydney Art Gallery",
        cityName: "Sydney",
        soldArtworks: [
          {
            art_code: "AB2995-1-3",
            sale_price: 450,
            payment_status: "PAID OTHER",
            round: 1,
            easel: 3
          },
          {
            art_code: "AB2995-2-1", 
            sale_price: 320,
            payment_status: "NOT PAID YET",
            round: 2,
            easel: 1
          }
        ],
        noBidArtworks: ["AB2995-3-2"],
        totalEarned: 385,
        eventLink: "https://artb.art/event/be73fa57-4755-45c6-a457-ef43c3332cce",
        paymentMethodText: "We exclusively send payments via PayPal or Zelle. Please confirm one of the following, so we may get your payment sent promptly\\n\\nPayPal - email or handle\\n\\nZelle - email or phone",
        hasUnpaidSales: true,
        detailedArtworkList: "AB2995-1-3, AB2995-2-1"
      },
      'payment-no-sales': {
        artistName: "John Smith",
        eventEid: "AB2995",
        eventName: "AB2995 – Sydney", 
        eventDate: "Friday, August 22, 2025",
        eventVenue: "Sydney Art Gallery",
        cityName: "Sydney",
        soldArtworks: [],
        noBidArtworks: ["AB2995-1-5", "AB2995-2-3"],
        totalEarned: 0,
        eventLink: "https://artb.art/event/be73fa57-4755-45c6-a457-ef43c3332cce",
        paymentMethodText: "We exclusively send payments via PayPal or Zelle. Please confirm one of the following, so we may get your payment sent promptly\\n\\nPayPal - email or handle\\n\\nZelle - email or phone",
        hasUnpaidSales: false,
        detailedArtworkList: ""
      },
      'payment-canadian': {
        artistName: "Marie Tremblay",
        eventEid: "AB3045",
        eventName: "AB3045 – Toronto",
        eventDate: "Saturday, September 15, 2025", 
        eventVenue: "Toronto Centre for Arts",
        cityName: "Toronto",
        soldArtworks: [
          {
            art_code: "AB3045-1-2",
            sale_price: 275,
            payment_status: "PAID VIA STRIPE",
            round: 1,
            easel: 2
          }
        ],
        noBidArtworks: [],
        totalEarned: 138,
        eventLink: "https://artb.art/event/be73fa57-4755-45c6-a457-ef43c3332cce",
        paymentMethodText: "We send payments via Interac e-Transfer or PayPal. Please confirm one of the following, so we may get your payment sent promptly\\n\\nInterac e-Transfer - email address\\n\\nPayPal - email or handle",
        hasUnpaidSales: false,
        detailedArtworkList: "AB3045-1-2"
      }
    }

    const data = sampleData[template as keyof typeof sampleData]
    if (!data) {
      return new Response(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Art Battle Email Templates</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                h1 { color: #e74c3c; margin-bottom: 30px; }
                ul { list-style: none; padding: 0; }
                ul li { margin: 10px 0; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                a { color: #e74c3c; text-decoration: none; font-size: 16px; font-weight: bold; }
                a:hover { text-decoration: underline; }
                .section { margin: 30px 0; }
                .section h2 { color: #666; border-bottom: 2px solid #e74c3c; padding-bottom: 10px; }
            </style>
        </head>
        <body>
            <h1>Art Battle Email Templates</h1>
            
            <div class="section">
                <h2>Artist Journey Templates</h2>
                <ul>
                    <li><a href="?template=application">Application Received</a> - Artist applies to event</li>
                    <li><a href="?template=invitation">Artist Invited</a> - Artist gets invited to participate</li>
                    <li><a href="?template=confirmation">Artist Confirmed</a> - Artist accepts invitation (with artist number)</li>
                    <li><a href="?template=cancellation">Artist Cancelled</a> - Artist cancels participation</li>
                </ul>
            </div>
            
            <div class="section">
                <h2>Post-Event Payment Templates</h2>
                <ul>
                    <li><a href="?template=payment-with-sales">Payment - With Sales</a> - Artist sold artwork(s)</li>
                    <li><a href="?template=payment-no-sales">Payment - No Sales</a> - Artist didn't sell anything</li>
                    <li><a href="?template=payment-canadian">Payment - Canadian</a> - Canadian payment methods (Interac)</li>
                </ul>
            </div>
        </body>
        </html>
      `, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
      })
    }

    // Generate the appropriate email template
    let emailTemplate
    
    if (template.startsWith('payment-')) {
      emailTemplate = emailTemplates.paymentNotification(data)
    } else if (template === 'application') {
      emailTemplate = emailTemplates.applicationReceived(data)
    } else if (template === 'invitation') {
      emailTemplate = emailTemplates.artistInvited(data)
    } else if (template === 'confirmation') {
      emailTemplate = emailTemplates.artistConfirmed(data)
    } else if (template === 'cancellation') {
      emailTemplate = emailTemplates.artistCancelled(data)
    } else {
      return new Response('Unknown template', { status: 404, headers: corsHeaders })
    }

    // Return just the email HTML with basic styling
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${emailTemplate.subject}</title>
    <style>
        body { 
            margin: 0; 
            padding: 20px; 
            font-family: Arial, sans-serif; 
            background: #f5f5f5; 
        }
    </style>
</head>
<body>
    ${emailTemplate.html}
</body>
</html>`

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8'
      }
    })

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    })
  }
})