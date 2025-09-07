// OBSOLETE: This function checks raw_user_meta_data consistency which is no longer used
// Since Sept 2025 auth system overhaul, raw_user_meta_data dependencies were eliminated
// The metadata mismatch checks in this function are now obsolete but kept for historical reference
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SecurityCheck {
  check_name: string;
  issue_type: string;
  issue_count: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details?: any;
  recommended_action: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create supabase admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const checks: SecurityCheck[] = [];

    console.log('Starting comprehensive security monitoring checks...')

    // 1. Auth Metadata Contamination Check
    console.log('Checking auth metadata consistency...')
    const { data: metadataMismatches, error: metadataError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          au.id as user_id,
          au.phone,
          au.raw_user_meta_data->>'person_id' as metadata_person_id,
          p.id::text as actual_person_id
        FROM auth.users au 
        JOIN people p ON au.id = p.auth_user_id 
        WHERE au.raw_user_meta_data->>'person_id' <> p.id::text
      `
    });

    if (!metadataError && metadataMismatches?.length > 0) {
      checks.push({
        check_name: 'Auth Metadata Consistency',
        issue_type: 'auth_metadata_contamination',
        issue_count: metadataMismatches.length,
        severity: 'CRITICAL',
        details: metadataMismatches,
        recommended_action: 'URGENT: Auth metadata contamination detected. Review AUTH_METADATA_CONTAMINATION_BUG_2025-09-04.md procedures.'
      });
    }

    // 2. Orphaned Artist Profiles
    console.log('Checking for orphaned artist profiles...')
    const { data: orphanedProfiles, error: orphanError } = await supabase.rpc('sql', {
      query: `
        SELECT ap.id, ap.name, ap.person_id
        FROM artist_profiles ap
        LEFT JOIN people p ON ap.person_id = p.id
        WHERE ap.person_id IS NOT NULL AND p.id IS NULL
      `
    });

    if (!orphanError && orphanedProfiles?.length > 0) {
      checks.push({
        check_name: 'Orphaned Artist Profiles',
        issue_type: 'orphaned_profiles',
        issue_count: orphanedProfiles.length,
        severity: 'HIGH',
        details: orphanedProfiles,
        recommended_action: 'Review and clean up orphaned profiles or restore missing people records.'
      });
    }

    // 3. Duplicate Profile Links (Multiple profiles per person)
    console.log('Checking for duplicate person profile links...')
    const { data: duplicateLinks, error: duplicateError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          person_id, 
          COUNT(*) as profile_count,
          array_agg(id) as profile_ids,
          array_agg(name) as profile_names
        FROM artist_profiles 
        WHERE person_id IS NOT NULL
        GROUP BY person_id
        HAVING COUNT(*) > 1
      `
    });

    if (!duplicateError && duplicateLinks?.length > 0) {
      checks.push({
        check_name: 'Duplicate Profile Links',
        issue_type: 'duplicate_person_links',
        issue_count: duplicateLinks.length,
        severity: 'HIGH',
        details: duplicateLinks,
        recommended_action: 'Consolidate duplicate profiles per person or unlink incorrect profiles.'
      });
    }

    // 4. Missing Auth User Links
    console.log('Checking for people without auth users...')
    const { data: missingAuth, error: authError } = await supabase.rpc('sql', {
      query: `
        SELECT p.id, p.name, p.phone
        FROM people p
        LEFT JOIN auth.users au ON p.auth_user_id = au.id
        WHERE p.auth_user_id IS NOT NULL AND au.id IS NULL
      `
    });

    if (!authError && missingAuth?.length > 0) {
      checks.push({
        check_name: 'Missing Auth Users',
        issue_type: 'missing_auth_users',
        issue_count: missingAuth.length,
        severity: 'MEDIUM',
        details: missingAuth,
        recommended_action: 'Clean up people records with invalid auth_user_id references.'
      });
    }

    // 5. Profile Phone Mismatches  
    console.log('Checking profile phone vs auth phone mismatches...')
    const { data: phoneMismatches, error: phoneError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          ap.id as profile_id,
          ap.name,
          ap.phone as profile_phone,
          au.phone as auth_phone,
          ap.person_id
        FROM artist_profiles ap
        JOIN people p ON ap.person_id = p.id
        JOIN auth.users au ON p.auth_user_id = au.id
        WHERE ap.phone IS NOT NULL 
          AND au.phone IS NOT NULL
          AND ap.phone <> au.phone
      `
    });

    if (!phoneError && phoneMismatches?.length > 0) {
      checks.push({
        check_name: 'Profile Phone Mismatches',
        issue_type: 'phone_mismatches',
        issue_count: phoneMismatches.length,
        severity: 'MEDIUM',
        details: phoneMismatches,
        recommended_action: 'Review and synchronize phone numbers between profiles and auth users.'
      });
    }

    // 6. Broken Sample Works Links
    console.log('Checking for broken sample works media files...')
    const { data: brokenMedia, error: mediaError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          asw.id as sample_work_id,
          asw.artist_profile_id,
          asw.media_id,
          ap.name as artist_name
        FROM artist_sample_works asw
        JOIN artist_profiles ap ON asw.artist_profile_id = ap.id
        LEFT JOIN media_files mf ON asw.media_id = mf.id
        WHERE asw.media_id IS NOT NULL AND mf.id IS NULL
      `
    });

    if (!mediaError && brokenMedia?.length > 0) {
      checks.push({
        check_name: 'Broken Sample Works Media',
        issue_type: 'broken_media_links',
        issue_count: brokenMedia.length,
        severity: 'LOW',
        details: brokenMedia,
        recommended_action: 'Clean up sample works with missing media files.'
      });
    }

    // 7. Event Confirmation Orphans
    console.log('Checking for event confirmations with missing profiles...')
    const { data: orphanConfirmations, error: confirmError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          ac.id as confirmation_id,
          ac.artist_profile_id,
          ac.event_eid,
          ac.confirmation_status
        FROM artist_confirmations ac
        LEFT JOIN artist_profiles ap ON ac.artist_profile_id = ap.id
        WHERE ap.id IS NULL
      `
    });

    if (!confirmError && orphanConfirmations?.length > 0) {
      checks.push({
        check_name: 'Orphaned Event Confirmations',
        issue_type: 'orphaned_confirmations',
        issue_count: orphanConfirmations.length,
        severity: 'LOW',
        details: orphanConfirmations,
        recommended_action: 'Clean up confirmations referencing deleted artist profiles.'
      });
    }

    // 8. Artworks with Missing Artists
    console.log('Checking for artworks with missing artist profiles...')
    const { data: orphanArtworks, error: artError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          a.id as art_id,
          a.art_code,
          a.artist_id,
          a.status
        FROM art a
        LEFT JOIN artist_profiles ap ON a.artist_id = ap.id
        WHERE a.artist_id IS NOT NULL AND ap.id IS NULL
      `
    });

    if (!artError && orphanArtworks?.length > 0) {
      checks.push({
        check_name: 'Orphaned Artworks',
        issue_type: 'orphaned_artworks',
        issue_count: orphanArtworks.length,
        severity: 'MEDIUM',
        details: orphanArtworks,
        recommended_action: 'Review artworks with missing artist profiles - may indicate profile deletion issues.'
      });
    }

    // 9. Duplicate Phone Numbers in Profiles
    console.log('Checking for duplicate phone numbers in artist profiles...')
    const { data: duplicatePhones, error: phonesDupError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          phone,
          COUNT(*) as profile_count,
          array_agg(id) as profile_ids,
          array_agg(name) as profile_names
        FROM artist_profiles 
        WHERE phone IS NOT NULL AND phone <> ''
        GROUP BY phone
        HAVING COUNT(*) > 1
      `
    });

    if (!phonesDupError && duplicatePhones?.length > 0) {
      checks.push({
        check_name: 'Duplicate Profile Phones',
        issue_type: 'duplicate_profile_phones',
        issue_count: duplicatePhones.length,
        severity: 'MEDIUM',
        details: duplicatePhones,
        recommended_action: 'Review duplicate phone numbers - may indicate profile duplication issues.'
      });
    }

    // 10. Today's Invitations Without Email Logs
    console.log('Checking today\'s invitations for missing email logs...')
    const { data: invitationsNoEmail, error: inviteEmailError } = await supabase.rpc('sql', {
      query: `
        WITH todays_invitations AS (
          SELECT 
            ai.created_at,
            ai.event_eid,
            ai.artist_number,
            ap.name as artist_name,
            COALESCE(p.email, au.email) as artist_email,
            ai.id as invitation_id
          FROM artist_invitations ai
          LEFT JOIN artist_profiles ap ON ai.artist_profile_id = ap.id  
          LEFT JOIN people p ON ap.person_id = p.id
          LEFT JOIN auth.users au ON p.phone = au.phone OR p.email = au.email
          WHERE ai.created_at >= CURRENT_DATE
            AND ai.status = 'pending'
        ),
        todays_emails AS (
          SELECT DISTINCT recipient 
          FROM email_logs 
          WHERE subject ILIKE '%invited%'
            AND sent_at >= CURRENT_DATE
        )
        SELECT 
          ti.*,
          CASE 
            WHEN ti.artist_email IS NULL THEN 'NO_EMAIL_IN_SYSTEM'
            WHEN te.recipient IS NULL THEN 'INVITATION_NO_EMAIL_SENT' 
            ELSE 'EMAIL_SENT'
          END as email_status
        FROM todays_invitations ti
        LEFT JOIN todays_emails te ON ti.artist_email = te.recipient
        WHERE ti.artist_email IS NULL OR te.recipient IS NULL
        ORDER BY ti.created_at DESC
      `
    });

    if (!inviteEmailError && invitationsNoEmail?.length > 0) {
      const criticalIssues = invitationsNoEmail.filter(i => 
        i.email_status === 'INVITATION_NO_EMAIL_SENT' && 
        new Date().getTime() - new Date(i.created_at).getTime() > 2 * 60 * 60 * 1000 // > 2 hours
      );
      
      checks.push({
        check_name: 'Today\'s Invitations Missing Emails',
        issue_type: 'invitations_missing_emails',
        issue_count: invitationsNoEmail.length,
        severity: criticalIssues.length > 0 ? 'CRITICAL' : 'HIGH',
        details: invitationsNoEmail,
        recommended_action: criticalIssues.length > 0 ? 
          'URGENT: Some invitations > 2 hours old without emails sent to artists who have email addresses!' :
          'Review invitations created today - some missing emails or artist email addresses.'
      });
    }

    // 11. Email System Health Check (Last 7 Days)
    console.log('Checking email system health for last 7 days...')
    const { data: emailHealth, error: emailHealthError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          DATE(sent_at) as date,
          COUNT(*) as total_emails,
          SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status != 'sent' THEN 1 ELSE 0 END) as failed,
          ROUND(SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as success_rate
        FROM email_logs 
        WHERE sent_at >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY DATE(sent_at)
        HAVING COUNT(*) > 0
        ORDER BY date DESC
      `
    });

    if (!emailHealthError && emailHealth?.length > 0) {
      const todayStats = emailHealth.find(day => day.date === new Date().toISOString().split('T')[0]);
      const recentFailureRate = emailHealth[0]?.success_rate || 100;
      
      if (recentFailureRate < 90) {
        checks.push({
          check_name: 'Email Delivery Failure Rate',
          issue_type: 'email_delivery_failures',
          issue_count: emailHealth[0]?.failed || 0,
          severity: recentFailureRate < 80 ? 'CRITICAL' : 'HIGH',
          details: emailHealth.slice(0, 3), // Last 3 days
          recommended_action: `Email delivery rate is ${recentFailureRate}% - investigate send-custom-email function and delivery issues.`
        });
      }
    }

    // 12. Artists Without Email Addresses
    console.log('Checking for artist profiles missing email addresses...')
    const { data: artistsNoEmail, error: noEmailError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          ap.id as profile_id,
          ap.name as artist_name,
          p.phone,
          CASE 
            WHEN p.email IS NOT NULL THEN 'HAS_PEOPLE_EMAIL'
            WHEN au.email IS NOT NULL THEN 'HAS_AUTH_EMAIL'  
            ELSE 'NO_EMAIL_FOUND'
          END as email_status,
          COALESCE(p.email, au.email, 'NONE') as available_email
        FROM artist_profiles ap
        LEFT JOIN people p ON ap.person_id = p.id
        LEFT JOIN auth.users au ON p.phone = au.phone OR p.email = au.email
        WHERE COALESCE(p.email, au.email) IS NULL
        ORDER BY ap.name
      `
    });

    if (!noEmailError && artistsNoEmail?.length > 0) {
      checks.push({
        check_name: 'Artists Without Email Addresses',
        issue_type: 'artists_missing_emails',
        issue_count: artistsNoEmail.length,
        severity: 'MEDIUM',
        details: artistsNoEmail.slice(0, 10), // Show first 10
        recommended_action: `${artistsNoEmail.length} artists cannot receive email invitations - collect email addresses.`
      });
    }

    // 13. Pending Invitations Older Than 3 Days
    console.log('Checking for old pending invitations...')
    const { data: oldInvitations, error: oldInviteError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          ai.created_at,
          ai.event_eid,
          e.name as event_name,
          ai.artist_number,
          ap.name as artist_name,
          COALESCE(p.email, au.email, 'NO_EMAIL') as artist_email,
          EXTRACT(day FROM NOW() - ai.created_at) as days_pending
        FROM artist_invitations ai
        LEFT JOIN artist_profiles ap ON ai.artist_profile_id = ap.id
        LEFT JOIN people p ON ap.person_id = p.id  
        LEFT JOIN auth.users au ON p.phone = au.phone OR p.email = au.email
        LEFT JOIN events e ON ai.event_eid = e.eid
        WHERE ai.status = 'pending' 
          AND ai.created_at < CURRENT_DATE - INTERVAL '3 days'
        ORDER BY ai.created_at ASC
      `
    });

    if (!oldInviteError && oldInvitations?.length > 0) {
      checks.push({
        check_name: 'Old Pending Invitations',
        issue_type: 'old_pending_invitations',
        issue_count: oldInvitations.length,
        severity: 'MEDIUM',
        details: oldInvitations,
        recommended_action: `${oldInvitations.length} invitations pending > 3 days - may need follow-up or manual intervention.`
      });
    }

    // 14. Email Delivery Failures Analysis
    console.log('Analyzing email delivery failures for last 7 days...')
    const { data: emailFailures, error: failureError } = await supabase.rpc('sql', {
      query: `
        SELECT 
          error_message,
          COUNT(*) as failure_count,
          array_agg(DISTINCT recipient) as affected_emails
        FROM email_logs 
        WHERE status != 'sent' 
          AND sent_at >= CURRENT_DATE - INTERVAL '7 days'
          AND subject ILIKE '%invited%'
        GROUP BY error_message
        ORDER BY failure_count DESC
      `
    });

    if (!failureError && emailFailures?.length > 0) {
      const totalFailures = emailFailures.reduce((sum, f) => sum + f.failure_count, 0);
      checks.push({
        check_name: 'Email Delivery Failure Patterns',
        issue_type: 'email_failure_patterns',
        issue_count: totalFailures,
        severity: totalFailures > 10 ? 'HIGH' : 'MEDIUM',
        details: emailFailures,
        recommended_action: `${totalFailures} invitation email failures in last 7 days - review error patterns and affected addresses.`
      });
    }

    // Generate summary
    const criticalIssues = checks.filter(c => c.severity === 'CRITICAL').length;
    const highIssues = checks.filter(c => c.severity === 'HIGH').length;
    const mediumIssues = checks.filter(c => c.severity === 'MEDIUM').length;
    const lowIssues = checks.filter(c => c.severity === 'LOW').length;
    const totalIssues = checks.reduce((sum, c) => sum + c.issue_count, 0);

    console.log(`Security monitoring complete. Found ${checks.length} issue types with ${totalIssues} total problems.`);

    // Send Slack notification via queue system if issues found
    let slackSent = false;
    if (checks.length > 0) {
      try {
        console.log('Queueing Slack notification via database queue system...');
        
        const emoji = criticalIssues > 0 ? '🚨' : highIssues > 0 ? '⚠️' : '📊';
        
        // Build detailed issues summary
        let checksSummary = '';
        checks.forEach(check => {
          const severityEmoji = check.severity === 'CRITICAL' ? '🚨' : 
                                check.severity === 'HIGH' ? '⚠️' : 
                                check.severity === 'MEDIUM' ? '🔶' : '🔍';
          checksSummary += `${severityEmoji} *${check.check_name}*: ${check.issue_count} issues (${check.severity})\n`;
          checksSummary += `   └ ${check.recommended_action}\n\n`;
        });

        // Build Slack blocks format
        const slackBlocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *Database Security Monitoring Alert*\n\n*Security Monitoring Results:* Found ${checks.length} issue types with ${totalIssues} total problems\n\n*Issue Breakdown:*\n🚨 Critical: ${criticalIssues}\n⚠️ High: ${highIssues}\n🔶 Medium: ${mediumIssues}\n🔍 Low: ${lowIssues}`
            }
          }
        ];

        // Add detailed issues if any
        if (checksSummary.length > 0) {
          slackBlocks.push({
            type: "section", 
            text: {
              type: "mrkdwn",
              text: `*Detailed Issues:*\n\n${checksSummary}`
            }
          });
        }

        // Add footer with timestamp
        slackBlocks.push({
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `🕐 ${new Date().toISOString()} | Database Security Monitor`
            }
          ]
        });

        // Queue the notification
        const { data: queueResult, error: queueError } = await supabase.rpc('queue_slack_notification', {
          p_channel_name: 'profile-debug',
          p_message_type: 'security_monitoring_alert',
          p_text: `${emoji} Database Security Monitoring Alert`,
          p_blocks: slackBlocks
        });

        if (queueError) {
          console.error('Failed to queue Slack notification:', queueError);
        } else {
          console.log('Slack notification queued successfully:', queueResult);
          slackSent = true;
        }

      } catch (error) {
        console.error('Error queueing Slack notification:', error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        summary: {
          total_issue_types: checks.length,
          total_issues: totalIssues,
          critical_issues: criticalIssues,
          high_issues: highIssues,
          medium_issues: mediumIssues,
          low_issues: lowIssues,
          slack_notification_sent: slackSent
        },
        checks: checks
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error in admin-security-monitor:', error)
    
    // Send error notification via Slack queue
    try {
      const errorBlocks = [
        {
          type: "section",
          text: {
            type: "mrkdwn", 
            text: `🚨 *Database Security Monitor FAILED*\n\n*Error:* ${error.message || 'Unknown error'}\n\n*Timestamp:* ${new Date().toISOString()}`
          }
        }
      ];

      await supabase.rpc('queue_slack_notification', {
        p_channel_name: 'profile-debug',
        p_message_type: 'security_monitor_error',
        p_text: '🚨 Database Security Monitor FAILED',
        p_blocks: errorBlocks
      });
      
      console.log('Error notification queued to Slack');
    } catch (slackError) {
      console.error('Failed to queue error notification to Slack:', slackError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})