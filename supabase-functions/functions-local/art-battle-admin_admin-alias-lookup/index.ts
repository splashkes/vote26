import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { identifiers, lookupType = 'comprehensive' } = await req.json()

    if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'identifiers array is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Admin alias lookup request: ${identifiers.length} identifiers, type: ${lookupType}`)

    // Result object to store all found profiles
    const results = {
      profiles: {},
      aliases: {},
      notFound: [],
      foundByAlias: [] // Track which IDs were found via alias lookup
    }

    // Helper function to process artist profiles and extract aliases
    const processProfilesAndAliases = (profiles: any[], isAliasLookup = false) => {
      profiles.forEach(profile => {
        // Store the main profile
        if (profile.entry_id) {
          results.profiles[profile.entry_id] = {
            ...profile,
            foundByAlias: isAliasLookup
          }
          if (isAliasLookup) {
            results.foundByAlias.push(profile.entry_id)
          }
        }

        // Process aliases if they exist
        if (profile.aliases && typeof profile.aliases === 'object') {
          // Handle both array and object formats of aliases
          let aliasData = profile.aliases
          
          // If aliases is an object with cluster info, extract entry_ids
          if (aliasData.cluster_entry_ids && Array.isArray(aliasData.cluster_entry_ids)) {
            aliasData.cluster_entry_ids.forEach((entryId: number) => {
              results.aliases[entryId] = {
                ...profile,
                foundByAlias: true
              }
              // Also store by entry_id for direct lookup
              results.profiles[entryId] = {
                ...profile,
                foundByAlias: true
              }
              if (!results.foundByAlias.includes(entryId)) {
                results.foundByAlias.push(entryId)
              }
            })
          }
          
          // If aliases is an array, process each item
          if (Array.isArray(aliasData)) {
            aliasData.forEach((alias: any) => {
              if (alias.cluster_entry_ids && Array.isArray(alias.cluster_entry_ids)) {
                alias.cluster_entry_ids.forEach((entryId: number) => {
                  results.aliases[entryId] = {
                    ...profile,
                    foundByAlias: true
                  }
                  results.profiles[entryId] = {
                    ...profile,
                    foundByAlias: true
                  }
                  if (!results.foundByAlias.includes(entryId)) {
                    results.foundByAlias.push(entryId)
                  }
                })
              }
            })
          }
        }
      })
    }

    // Convert identifiers to appropriate types
    const entryIds = identifiers
      .map(id => parseInt(id))
      .filter(id => !isNaN(id))

    const stringIdentifiers = identifiers
      .filter(id => isNaN(parseInt(id)))
      .map(id => String(id).toLowerCase())

    console.log(`Processing ${entryIds.length} entry IDs and ${stringIdentifiers.length} string identifiers`)

    // 1. Direct lookup by entry_id
    if (entryIds.length > 0) {
      const { data: directProfiles, error: directError } = await supabaseClient
        .from('artist_profiles')
        .select('*')
        .in('entry_id', entryIds)

      if (directError) {
        console.error('Error in direct profile lookup:', directError)
      } else if (directProfiles) {
        console.log(`Found ${directProfiles.length} direct profiles`)
        processProfilesAndAliases(directProfiles)
      }
    }

    // 2. Alias lookup for missing entry_ids
    const missingEntryIds = entryIds.filter(id => !results.profiles[id])
    
    if (missingEntryIds.length > 0) {
      console.log(`Looking up ${missingEntryIds.length} missing entry IDs in aliases`)
      
      // Use JSONB containment to find profiles with these entry_ids in aliases
      const aliasQueries = missingEntryIds.map(entryId => 
        `aliases @> '{"cluster_entry_ids": [${entryId}]}'`
      )
      
      // Split into smaller batches to avoid query length limits
      const batchSize = 10
      for (let i = 0; i < aliasQueries.length; i += batchSize) {
        const batch = aliasQueries.slice(i, i + batchSize)
        const orCondition = batch.join(' OR ')
        
        const { data: aliasProfiles, error: aliasError } = await supabaseClient
          .from('artist_profiles')
          .select('*')
          .or(orCondition)

        if (aliasError) {
          console.error('Error in alias lookup batch:', aliasError)
        } else if (aliasProfiles) {
          console.log(`Found ${aliasProfiles.length} profiles via alias lookup in batch`)
          processProfilesAndAliases(aliasProfiles, true)
        }
      }
    }

    // 3. String-based lookups (email, phone, name) if comprehensive lookup requested
    if (lookupType === 'comprehensive' && stringIdentifiers.length > 0) {
      console.log(`Performing comprehensive string lookup for ${stringIdentifiers.length} identifiers`)
      
      // Look for profiles by email, phone, or name
      const { data: stringProfiles, error: stringError } = await supabaseClient
        .from('artist_profiles')
        .select('*')
        .or(stringIdentifiers.map(id => 
          `email.ilike.%${id}%,phone.ilike.%${id}%,name.ilike.%${id}%`
        ).join(','))

      if (stringError) {
        console.error('Error in string-based lookup:', stringError)
      } else if (stringProfiles) {
        console.log(`Found ${stringProfiles.length} profiles via string lookup`)
        processProfilesAndAliases(stringProfiles)
      }
    }

    // 4. Track not found identifiers
    identifiers.forEach(id => {
      const numId = parseInt(id)
      if (!isNaN(numId)) {
        if (!results.profiles[numId] && !results.aliases[numId]) {
          results.notFound.push(id)
        }
      } else {
        // For string identifiers, check if any profile was found
        const found = Object.values(results.profiles).some((profile: any) => 
          profile.email?.toLowerCase().includes(id.toLowerCase()) ||
          profile.phone?.includes(id) ||
          profile.name?.toLowerCase().includes(id.toLowerCase())
        )
        if (!found) {
          results.notFound.push(id)
        }
      }
    })

    console.log(`Lookup complete: ${Object.keys(results.profiles).length} profiles, ${Object.keys(results.aliases).length} aliases, ${results.notFound.length} not found`)

    return new Response(
      JSON.stringify({
        success: true,
        data: results,
        stats: {
          totalRequested: identifiers.length,
          profilesFound: Object.keys(results.profiles).length,
          aliasesFound: Object.keys(results.aliases).length,
          notFound: results.notFound.length
        }
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Admin alias lookup error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})