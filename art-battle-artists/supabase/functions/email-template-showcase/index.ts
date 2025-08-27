import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { emailTemplates } from '../_shared/emailTemplates.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function serveIndividualTemplate(templateType: string) {
  const sampleData = {
    paymentNotification: {
      artistName: "Jane Doe",
      eventEid: "AB2995",
      eventName: "AB2995 – Sydney",
      eventDate: "Friday, August 22, 2025",
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
      artistEmail: "jane.doe@example.com"
    },
    paymentNotificationNoSales: {
      artistName: "John Smith",
      eventEid: "AB2995",
      eventName: "AB2995 – Sydney", 
      eventDate: "Friday, August 22, 2025",
      cityName: "Sydney",
      soldArtworks: [],
      noBidArtworks: ["AB2995-1-5", "AB2995-2-3"],
      totalEarned: 0,
      eventLink: "https://artb.art/event/be73fa57-4755-45c6-a457-ef43c3332cce",
      paymentMethodText: "We exclusively send payments via PayPal or Zelle. Please confirm one of the following, so we may get your payment sent promptly\\n\\nPayPal - email or handle\\n\\nZelle - email or phone",
      hasUnpaidSales: false,
      artistEmail: "john.smith@example.com"
    },
    paymentNotificationCanadian: {
      artistName: "Marie Tremblay",
      eventEid: "AB3045",
      eventName: "AB3045 – Toronto",
      eventDate: "Saturday, September 15, 2025", 
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
      artistEmail: "marie.tremblay@example.com"
    }
  }

  const templates = {
    'payment-with-sales': emailTemplates.paymentNotification(sampleData.paymentNotification),
    'payment-no-sales': emailTemplates.paymentNotification(sampleData.paymentNotificationNoSales),
    'payment-canadian': emailTemplates.paymentNotification(sampleData.paymentNotificationCanadian)
  }

  const template = templates[templateType as keyof typeof templates]
  if (!template) {
    return new Response('Template not found', { status: 404, headers: corsHeaders })
  }

  return new Response(template.html, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8'
    }
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const template = url.searchParams.get('template')
    
    // If requesting individual template, serve just that template
    if (template) {
      return serveIndividualTemplate(template)
    }

    // Sample data for all template types
    const sampleData = {
      // Payment notification template data
      paymentNotification: {
        artistName: "Jane Doe",
        eventEid: "AB2995",
        eventName: "AB2995 – Sydney",
        eventDate: "Friday, August 22, 2025",
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
        paymentMethodText: "We exclusively send payments via PayPal or Zelle. Please confirm one of the following, so we may get your payment sent promptly\n\nPayPal - email or handle\n\nZelle - email or phone",
        hasUnpaidSales: true,
        artistEmail: "jane.doe@example.com"
      },

      // No sales version
      paymentNotificationNoSales: {
        artistName: "John Smith",
        eventEid: "AB2995",
        eventName: "AB2995 – Sydney", 
        eventDate: "Friday, August 22, 2025",
        cityName: "Sydney",
        soldArtworks: [],
        noBidArtworks: ["AB2995-1-5", "AB2995-2-3"],
        totalEarned: 0,
        eventLink: "https://artb.art/event/be73fa57-4755-45c6-a457-ef43c3332cce",
        paymentMethodText: "We exclusively send payments via PayPal or Zelle. Please confirm one of the following, so we may get your payment sent promptly\n\nPayPal - email or handle\n\nZelle - email or phone",
        hasUnpaidSales: false,
        artistEmail: "john.smith@example.com"
      },

      // Canadian version
      paymentNotificationCanadian: {
        artistName: "Marie Tremblay",
        eventEid: "AB3045",
        eventName: "AB3045 – Toronto",
        eventDate: "Saturday, September 15, 2025", 
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
        paymentMethodText: "We send payments via Interac e-Transfer or PayPal. Please confirm one of the following, so we may get your payment sent promptly\n\nInterac e-Transfer - email address\n\nPayPal - email or handle",
        hasUnpaidSales: false,
        artistEmail: "marie.tremblay@example.com"
      }
    }

    // Generate all template variations
    console.log('Generating templates...')
    const templates = {
      paymentNotification: emailTemplates.paymentNotification(sampleData.paymentNotification),
      paymentNotificationNoSales: emailTemplates.paymentNotification(sampleData.paymentNotificationNoSales), 
      paymentNotificationCanadian: emailTemplates.paymentNotification(sampleData.paymentNotificationCanadian)
    }
    
    console.log('Template 1 HTML length:', templates.paymentNotification?.html?.length)
    console.log('Template 2 HTML length:', templates.paymentNotificationNoSales?.html?.length)
    console.log('Template 3 HTML length:', templates.paymentNotificationCanadian?.html?.length)

    // Create HTML showcase page
    const showcaseHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Art Battle Email Template Showcase</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            border-radius: 10px;
            margin-bottom: 2rem;
            text-align: center;
        }
        
        .header h1 {
            margin: 0;
            font-size: 2.5rem;
            font-weight: 300;
        }
        
        .header p {
            margin: 0.5rem 0 0 0;
            opacity: 0.9;
        }
        
        .template-section {
            background: white;
            border-radius: 10px;
            margin-bottom: 2rem;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .template-header {
            background: #333;
            color: white;
            padding: 1rem 2rem;
            margin: 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .template-title {
            font-size: 1.2rem;
            font-weight: 500;
            margin: 0;
        }
        
        .toggle-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.9rem;
        }
        
        .toggle-btn:hover {
            background: #5a6fd8;
        }
        
        .template-content {
            padding: 0;
        }
        
        .template-tabs {
            display: flex;
            background: #f8f9fa;
            border-bottom: 1px solid #ddd;
        }
        
        .tab-btn {
            flex: 1;
            background: none;
            border: none;
            padding: 1rem;
            cursor: pointer;
            font-weight: 500;
            border-bottom: 3px solid transparent;
            transition: all 0.3s;
        }
        
        .tab-btn.active {
            border-bottom-color: #667eea;
            color: #667eea;
            background: white;
        }
        
        .tab-btn:hover {
            background: #e9ecef;
        }
        
        .tab-content {
            display: none;
            padding: 2rem;
            min-height: 400px;
            max-height: 600px;
            overflow-y: auto;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .subject-line {
            background: #e3f2fd;
            padding: 1rem;
            border-left: 4px solid #2196f3;
            margin-bottom: 1rem;
            border-radius: 0 5px 5px 0;
        }
        
        .subject-line strong {
            color: #1976d2;
        }
        
        .email-preview {
            border: 1px solid #ddd;
            border-radius: 5px;
            overflow: hidden;
            background: white;
            padding: 2rem;
            font-family: Georgia, serif;
            line-height: 1.6;
            max-height: 600px;
            overflow-y: auto;
        }
        
        .email-preview h1, .email-preview h2, .email-preview h3 {
            color: #333;
            margin-top: 0;
        }
        
        .email-preview a {
            color: #1976d2;
        }
        
        .email-preview .email-header {
            text-align: center;
            margin-bottom: 2rem;
        }
        
        .email-preview .signature {
            margin-top: 2rem;
            font-style: italic;
            color: #666;
        }
        
        .raw-content {
            background: #f8f9fa;
            border: 1px solid #ddd;
            padding: 1rem;
            font-family: 'Monaco', 'Consolas', monospace;
            font-size: 0.85rem;
            white-space: pre-wrap;
            border-radius: 5px;
            max-height: 500px;
            overflow-y: auto;
        }
        
        .info-badge {
            display: inline-block;
            background: #28a745;
            color: white;
            padding: 0.3rem 0.8rem;
            border-radius: 20px;
            font-size: 0.8rem;
            margin-left: 1rem;
        }
        
        .data-info {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 1rem;
            border-radius: 5px;
            margin-bottom: 1rem;
            font-size: 0.9rem;
        }
        
        .email-iframe {
            width: 100%;
            height: 500px;
            border: none;
            background: white;
        }

        @media (max-width: 768px) {
            body { padding: 10px; }
            .header h1 { font-size: 2rem; }
            .template-tabs { flex-direction: column; }
            .tab-content { padding: 1rem; }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎨 Art Battle Email Templates</h1>
        <p>Live preview of all email templates • Generated ${new Date().toLocaleString()}</p>
    </div>

    <!-- Payment Notification - With Sales -->
    <div class="template-section">
        <div class="template-header">
            <h2 class="template-title">💰 Payment Notification - With Sales</h2>
            <span class="info-badge">Artist with sales</span>
        </div>
        <div class="template-content">
            <div class="data-info">
                <strong>Sample Data:</strong> Jane Doe • 2 sold artworks ($385 earned) • 1 no-bid artwork • Has unpaid sales
            </div>
            <div class="template-tabs">
                <button class="tab-btn active" onclick="showTab(this, 'preview1')">📧 Email Preview</button>
                <button class="tab-btn" onclick="showTab(this, 'html1')">🔧 HTML Code</button>
                <button class="tab-btn" onclick="showTab(this, 'text1')">📝 Text Version</button>
            </div>
            <div id="preview1" class="tab-content active">
                <div class="subject-line">
                    <strong>Subject:</strong> ${templates.paymentNotification.subject}
                </div>
                <iframe 
                    src="?template=payment-with-sales" 
                    class="email-iframe"
                    frameborder="0">
                </iframe>
            </div>
            <div id="html1" class="tab-content">
                <div class="raw-content">${templates.paymentNotification?.html || '<p style="color: red;">Template HTML not found</p>'.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
            <div id="text1" class="tab-content">
                <div class="raw-content">${templates.paymentNotification.text}</div>
            </div>
        </div>
    </div>

    <!-- Payment Notification - No Sales -->
    <div class="template-section">
        <div class="template-header">
            <h2 class="template-title">🎨 Payment Notification - No Sales</h2>
            <span class="info-badge">Artist with no sales</span>
        </div>
        <div class="template-content">
            <div class="data-info">
                <strong>Sample Data:</strong> John Smith • 0 sold artworks ($0 earned) • 2 no-bid artworks • Participation thank you
            </div>
            <div class="template-tabs">
                <button class="tab-btn active" onclick="showTab(this, 'preview2')">📧 Email Preview</button>
                <button class="tab-btn" onclick="showTab(this, 'html2')">🔧 HTML Code</button>
                <button class="tab-btn" onclick="showTab(this, 'text2')">📝 Text Version</button>
            </div>
            <div id="preview2" class="tab-content active">
                <div class="subject-line">
                    <strong>Subject:</strong> ${templates.paymentNotificationNoSales.subject}
                </div>
                <iframe 
                    src="?template=payment-no-sales" 
                    class="email-iframe"
                    frameborder="0">
                </iframe>
            </div>
            <div id="html2" class="tab-content">
                <div class="raw-content">${templates.paymentNotificationNoSales?.html || '<p style="color: red;">Template HTML not found</p>'.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
            <div id="text2" class="tab-content">
                <div class="raw-content">${templates.paymentNotificationNoSales.text}</div>
            </div>
        </div>
    </div>

    <!-- Payment Notification - Canadian Version -->
    <div class="template-section">
        <div class="template-header">
            <h2 class="template-title">🍁 Payment Notification - Canadian</h2>
            <span class="info-badge">Interac e-Transfer</span>
        </div>
        <div class="template-content">
            <div class="data-info">
                <strong>Sample Data:</strong> Marie Tremblay • Toronto event • 1 sold artwork ($138 earned) • Interac e-Transfer payment method
            </div>
            <div class="template-tabs">
                <button class="tab-btn active" onclick="showTab(this, 'preview3')">📧 Email Preview</button>
                <button class="tab-btn" onclick="showTab(this, 'html3')">🔧 HTML Code</button>
                <button class="tab-btn" onclick="showTab(this, 'text3')">📝 Text Version</button>
            </div>
            <div id="preview3" class="tab-content active">
                <div class="subject-line">
                    <strong>Subject:</strong> ${templates.paymentNotificationCanadian.subject}
                </div>
                <iframe 
                    src="?template=payment-canadian" 
                    class="email-iframe"
                    frameborder="0">
                </iframe>
            </div>
            <div id="html3" class="tab-content">
                <div class="raw-content">${templates.paymentNotificationCanadian?.html || '<p style="color: red;">Template HTML not found</p>'.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>
            <div id="text3" class="tab-content">
                <div class="raw-content">${templates.paymentNotificationCanadian.text}</div>
            </div>
        </div>
    </div>

    <div style="text-align: center; margin: 2rem 0; color: #666; font-size: 0.9rem;">
        <p>💡 <strong>Pro Tip:</strong> Click individual template links below to view them standalone</p>
        <p>🔗 Direct links: 
            <a href="?template=payment-with-sales" target="_blank">With Sales</a> | 
            <a href="?template=payment-no-sales" target="_blank">No Sales</a> | 
            <a href="?template=payment-canadian" target="_blank">Canadian</a>
        </p>
        <p>🔧 Edit templates in: <code>/supabase/functions/_shared/emailTemplates.ts</code></p>
    </div>

    <script>
        function showTab(button, tabId) {
            // Hide all tab contents in this section
            const section = button.closest('.template-section');
            const tabs = section.querySelectorAll('.tab-content');
            const buttons = section.querySelectorAll('.tab-btn');
            
            tabs.forEach(tab => tab.classList.remove('active'));
            buttons.forEach(btn => btn.classList.remove('active'));
            
            // Show selected tab
            document.getElementById(tabId).classList.add('active');
            button.classList.add('active');
        }
    </script>
</body>
</html>
    `

    return new Response(showcaseHtml, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html'
      }
    })

  } catch (error) {
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})