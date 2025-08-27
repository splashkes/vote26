#!/bin/bash

# Super Simple Email Template Deployment
set -e

echo "🚀 Deploying simple email templates..."

# Generate the simple email files
mkdir -p /tmp/simple-emails

echo "📧 Generating ALL email templates..."
# Artist journey templates
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/simple-email-viewer?template=application" > /tmp/simple-emails/application.html
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/simple-email-viewer?template=invitation" > /tmp/simple-emails/invitation.html
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/simple-email-viewer?template=confirmation" > /tmp/simple-emails/confirmation.html
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/simple-email-viewer?template=cancellation" > /tmp/simple-emails/cancellation.html

# Payment templates
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/simple-email-viewer?template=payment-with-sales" > /tmp/simple-emails/payment-with-sales.html
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/simple-email-viewer?template=payment-no-sales" > /tmp/simple-emails/payment-no-sales.html
curl -s "https://xsqdkubgyqwpyvfltnrf.supabase.co/functions/v1/simple-email-viewer?template=payment-canadian" > /tmp/simple-emails/payment-canadian.html

# Create simple index page
cat > /tmp/simple-emails/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Art Battle Email Templates</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
        h1 { color: #e74c3c; margin-bottom: 30px; }
        ul { list-style: none; padding: 0; }
        ul li { margin: 15px 0; background: white; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        a { color: #e74c3c; text-decoration: none; font-size: 18px; font-weight: bold; }
        a:hover { text-decoration: underline; }
        .instructions { background: #e3f2fd; padding: 15px; border-radius: 8px; margin-top: 30px; }
        .section { margin: 30px 0; }
        .section h2 { color: #666; border-bottom: 2px solid #e74c3c; padding-bottom: 10px; }
    </style>
</head>
<body>
    <h1>Art Battle Email Templates</h1>
    
    <div class="section">
        <h2>Artist Journey Templates</h2>
        <ul>
            <li><a href="application.html" target="_blank">Application Received</a></li>
            <li><a href="invitation.html" target="_blank">Artist Invited</a></li>
            <li><a href="confirmation.html" target="_blank">Artist Confirmed</a></li>
            <li><a href="cancellation.html" target="_blank">Artist Cancelled</a></li>
        </ul>
    </div>
    
    <div class="section">
        <h2>Post-Event Payment Templates</h2>
        <ul>
            <li><a href="payment-with-sales.html" target="_blank">Payment - With Sales</a></li>
            <li><a href="payment-no-sales.html" target="_blank">Payment - No Sales</a></li>
            <li><a href="payment-canadian.html" target="_blank">Payment - Canadian</a></li>
        </ul>
    </div>
    <div class="instructions">
        <p><strong>To edit:</strong> Modify /root/vote_app/vote26/supabase/functions/_shared/emailTemplates.ts</p>
        <p><strong>To update:</strong> Run ./deploy-simple-emails.sh</p>
    </div>
</body>
</html>
EOF

echo "☁️ Uploading to CDN..."

# Upload to CDN
for file in /tmp/simple-emails/*.html; do
    filename=$(basename "$file")
    echo "Uploading $filename..."
    s3cmd put "$file" s3://artb/simple-emails/$filename --acl-public --add-header="Content-Type:text/html"
done

echo "✅ Done! Templates available at:"
echo "  📋 Index: http://artb.tor1.digitaloceanspaces.com/simple-emails/index.html"
echo "  📧 With sales: http://artb.tor1.digitaloceanspaces.com/simple-emails/with-sales.html"
echo "  📧 No sales: http://artb.tor1.digitaloceanspaces.com/simple-emails/no-sales.html"
echo "  📧 Canadian: http://artb.tor1.digitaloceanspaces.com/simple-emails/canadian.html"

# Clean up
rm -rf /tmp/simple-emails