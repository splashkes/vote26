// Telnyx SMS Marketing - Template Management
// Date: August 26, 2025
// Purpose: CRUD operations for SMS marketing templates

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const url = new URL(req.url);
    const method = req.method;
    const templateId = url.searchParams.get('id');

    // Route requests based on method and parameters
    switch (method) {
      case 'GET':
        if (templateId) {
          return await getTemplate(supabase, templateId);
        } else {
          return await listTemplates(supabase, url.searchParams);
        }
      
      case 'POST':
        return await createTemplate(supabase, await req.json());
      
      case 'PUT':
        if (!templateId) {
          throw new Error('Template ID required for update');
        }
        return await updateTemplate(supabase, templateId, await req.json());
      
      case 'DELETE':
        if (!templateId) {
          throw new Error('Template ID required for delete');
        }
        return await deleteTemplate(supabase, templateId);
      
      default:
        return new Response(JSON.stringify({
          success: false,
          error: 'Method not allowed'
        }), {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }

  } catch (error) {
    console.error('Error in sms-marketing-templates function:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      details: 'Failed to process template request'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Get single template by ID
async function getTemplate(supabase: any, templateId: string) {
  const { data: template, error } = await supabase
    .from('sms_marketing_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Template not found'
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    data: template
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// List templates with optional filtering
async function listTemplates(supabase: any, searchParams: URLSearchParams) {
  let query = supabase.from('sms_marketing_templates').select('*');

  // Apply filters
  const category = searchParams.get('category');
  const isActive = searchParams.get('is_active');
  const limit = searchParams.get('limit');
  const offset = searchParams.get('offset');

  if (category) {
    query = query.eq('category', category);
  }

  if (isActive !== null) {
    query = query.eq('is_active', isActive === 'true');
  }

  // Pagination
  if (limit) {
    query = query.limit(parseInt(limit));
  }

  if (offset) {
    query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit || '50') - 1);
  }

  // Order by updated_at desc
  query = query.order('updated_at', { ascending: false });

  const { data: templates, error } = await query;

  if (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    data: templates,
    count: templates.length
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Create new template
async function createTemplate(supabase: any, templateData: any) {
  const {
    name,
    description,
    message_template,
    variables = [],
    category,
    is_active = true,
    created_by
  } = templateData;

  // Validate required fields
  if (!name || !message_template) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Name and message_template are required'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Calculate character count (for reference)
  const characterCount = message_template.length;

  // Validate template variables format
  if (!Array.isArray(variables)) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Variables must be an array of strings'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Extract variables from template if not provided
  let templateVariables = variables;
  if (templateVariables.length === 0) {
    const variableMatches = message_template.match(/\{\{(\w+)\}\}/g);
    if (variableMatches) {
      templateVariables = variableMatches.map((match: string) => 
        match.replace(/\{\{|\}\}/g, '')
      );
      templateVariables = [...new Set(templateVariables)]; // Remove duplicates
    }
  }

  const { data: template, error } = await supabase
    .from('sms_marketing_templates')
    .insert({
      name,
      description,
      message_template,
      variables: templateVariables,
      character_count: characterCount,
      category,
      is_active,
      created_by
    })
    .select('*')
    .single();

  if (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Template created successfully',
    data: template
  }), {
    status: 201,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Update existing template
async function updateTemplate(supabase: any, templateId: string, templateData: any) {
  const {
    name,
    description,
    message_template,
    variables,
    category,
    is_active
  } = templateData;

  // Build update object with only provided fields
  const updateData: any = {};
  
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (message_template !== undefined) {
    updateData.message_template = message_template;
    updateData.character_count = message_template.length;
    
    // Auto-extract variables if not provided
    if (!variables) {
      const variableMatches = message_template.match(/\{\{(\w+)\}\}/g);
      if (variableMatches) {
        updateData.variables = [...new Set(
          variableMatches.map((match: string) => match.replace(/\{\{|\}\}/g, ''))
        )];
      }
    }
  }
  if (variables !== undefined) updateData.variables = variables;
  if (category !== undefined) updateData.category = category;
  if (is_active !== undefined) updateData.is_active = is_active;

  if (Object.keys(updateData).length === 0) {
    return new Response(JSON.stringify({
      success: false,
      error: 'No fields provided for update'
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const { data: template, error } = await supabase
    .from('sms_marketing_templates')
    .update(updateData)
    .eq('id', templateId)
    .select('*')
    .single();

  if (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Template updated successfully',
    data: template
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Delete template (soft delete by setting is_active to false)
async function deleteTemplate(supabase: any, templateId: string) {
  // Check if template is being used by active campaigns
  const { data: activeCampaigns, error: campaignError } = await supabase
    .from('sms_marketing_campaigns')
    .select('id, name')
    .eq('template_id', templateId)
    .in('status', ['draft', 'scheduled', 'sending']);

  if (campaignError) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Error checking template usage'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (activeCampaigns && activeCampaigns.length > 0) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Cannot delete template that is being used by active campaigns',
      active_campaigns: activeCampaigns
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Soft delete by setting is_active to false
  const { error } = await supabase
    .from('sms_marketing_templates')
    .update({ is_active: false })
    .eq('id', templateId);

  if (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    message: 'Template deleted successfully'
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}