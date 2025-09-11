import { useState, useEffect } from 'react';
import { 
  Card, 
  Box, 
  Text, 
  Button, 
  Badge, 
  Spinner,
  Grid,
  Heading
} from '@radix-ui/themes';
import { DownloadIcon, PlayIcon, UpdateIcon, CheckCircledIcon } from '@radix-ui/react-icons';
import { exportToPNG, exportToMP4 } from '../lib/templateRenderer';

const TemplateCard = ({ template, eventData, artistData = null, allArtists = [] }) => {
  const [materials, setMaterials] = useState({}); // variant -> material status
  const [generating, setGenerating] = useState({}); // variant -> generating state

  const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';

  // Check if materials already exist for this template
  useEffect(() => {
    checkExistingMaterials();
  }, [template, eventData, artistData]);

  const checkExistingMaterials = async () => {
    if (!template?.spec?.variants) return;

    console.log('Checking existing materials for template:', template.name);

    const spec = typeof template.spec === 'string' ? JSON.parse(template.spec) : template.spec;
    
    for (const variant of spec.variants) {
      try {
        const checkUrl = artistData 
          ? `${supabaseUrl}/functions/v1/promo-generator/check/${eventData.id}/${template.id}/${variant.id}/${artistData.id}`
          : `${supabaseUrl}/functions/v1/promo-generator/check/${eventData.id}/${template.id}/${variant.id}`;

        console.log('Checking URL:', checkUrl);

        const response = await fetch(checkUrl);
        const data = await response.json();
        
        console.log('Check response for variant', variant.id, ':', data);
        
        if (data.exists && data.material) {
          console.log('Found existing material for variant', variant.id, ':', data.material);
          console.log('Setting material state for variant', variant.id);
          setMaterials(prev => {
            const newState = {
              ...prev,
              [variant.id]: data.material
            };
            console.log('New materials state:', newState);
            return newState;
          });
        } else {
          console.log('No existing material found for variant', variant.id);
        }
      } catch (error) {
        console.warn('Error checking existing material:', error);
      }
    }
  };

  const handleGenerate = async (variant) => {
    if (!template || !eventData) return;

    const spec = typeof template.spec === 'string' ? JSON.parse(template.spec) : template.spec;
    const variantSpec = spec.variants?.find(v => v.id === variant) || spec.variants?.[0];
    
    if (!variantSpec) {
      alert('Variant not found');
      return;
    }

    setGenerating(prev => ({ ...prev, [variant]: true }));

    try {
      console.log('Starting generation for:', { template: template.name, variant, artist: artistData?.display_name });

      // Generate PNG locally first
      const pngDataUrl = await exportToPNG(spec, variant, eventData, artistData, allArtists);
      
      console.log('PNG generated successfully, data URL length:', pngDataUrl.length);

      // Upload via edge function (handles Cloudflare upload internally)
      console.log('=== UPLOADING VIA EDGE FUNCTION ===');
      
      const uploadPayload = {
        event_id: eventData.id,
        artist_id: artistData?.id || null,
        template_id: template.id,
        template_name: template.name,
        template_kind: template.kind,
        variant,
        spec,
        png_data: pngDataUrl
      };

      console.log('=== PREPARING UPLOAD ===');
      console.log('Upload payload keys:', Object.keys(uploadPayload));
      console.log('Event ID:', uploadPayload.event_id);
      console.log('Template ID:', uploadPayload.template_id);
      console.log('Variant:', uploadPayload.variant);
      console.log('PNG data length:', uploadPayload.png_data?.length);
      console.log('Supabase URL:', supabaseUrl);

      console.log('=== STARTING UPLOAD TO EDGE FUNCTION ===');
      
      // Check payload size before upload
      const payloadString = JSON.stringify(uploadPayload);
      const payloadSizeKB = Math.round(payloadString.length / 1024);
      const payloadSizeMB = Math.round(payloadSizeKB / 1024);
      console.log(`Payload size: ${payloadSizeKB} KB (${payloadSizeMB} MB)`);
      
      if (payloadSizeMB > 25) {
        console.warn('Payload is very large, this might cause issues');
      }
      
      try {
        const uploadResponse = await fetch(`${supabaseUrl}/functions/v1/promo-generator`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: payloadString
        });

        console.log('Upload response status:', uploadResponse.status);
        console.log('Upload response ok:', uploadResponse.ok);

        const uploadResult = await uploadResponse.json();
        console.log('Upload result:', uploadResult);
        
        if (!uploadResponse.ok) {
          console.error('Upload failed with status:', uploadResponse.status);
          console.error('Upload error result:', uploadResult);
          
          // Parse debug info if available
          if (uploadResult.debug) {
            console.error('=== EDGE FUNCTION DEBUG INFO ===');
            console.error('Function:', uploadResult.debug.function_name);
            console.error('Operation:', uploadResult.debug.operation);
            console.error('Timestamp:', uploadResult.debug.timestamp);
            console.error('Database error:', uploadResult.debug.database_error);
            console.error('Payload info:', uploadResult.debug.payload_info);
          }
          
          throw new Error(uploadResult.error || 'Upload failed');
        }

        console.log('=== UPLOAD SUCCESSFUL ===');
        console.log('Material ID:', uploadResult.id);
        console.log('Status:', uploadResult.status);
        console.log('PNG URL:', uploadResult.png_url?.substring(0, 100) + '...');

        // Update materials with response data
        setMaterials(prev => ({
          ...prev,
          [variant]: {
            id: uploadResult.id,
            status: uploadResult.status,
            png_url: uploadResult.png_url,
            thumbnail_url: uploadResult.thumbnail_url,
            width: variantSpec.w,
            height: variantSpec.h
          }
        }));
      } catch (fetchError) {
        console.error('=== FETCH ERROR ===');
        console.error('Fetch failed:', fetchError);
        throw fetchError;
      }

    } catch (error) {
      console.error('Generation error:', error);
      alert('Error generating material: ' + error.message);
    } finally {
      setGenerating(prev => ({ ...prev, [variant]: false }));
    }
  };

  const handleDownloadPNG = async (variant) => {
    try {
      const material = materials[variant];
      if (material?.png_url) {
        // If we have a stored URL, use it
        const link = document.createElement('a');
        link.download = `${template.name.replace(/\\s+/g, '_')}_${variant}_${artistData?.display_name?.replace(/\\s+/g, '_') || 'event'}.png`;
        link.href = material.png_url;
        link.click();
      } else {
        // Generate and download directly
        const spec = typeof template.spec === 'string' ? JSON.parse(template.spec) : template.spec;
        const dataUrl = await exportToPNG(spec, variant, eventData, artistData, allArtists);
        
        // Manual download
        const filename = `${template.name.replace(/\\s+/g, '_')}_${variant}_${artistData?.display_name?.replace(/\\s+/g, '_') || 'event'}.png`;
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Error downloading PNG: ' + error.message);
    }
  };

  const handleDownloadMP4 = async (variant) => {
    try {
      const material = materials[variant];
      if (material?.webm_url) {
        // If we have a stored URL, use it
        const link = document.createElement('a');
        link.download = `${template.name.replace(/\\s+/g, '_')}_${variant}_${artistData?.display_name?.replace(/\\s+/g, '_') || 'event'}.webm`;
        link.href = material.webm_url;
        link.click();
      } else {
        // Fallback to direct generation
        const spec = typeof template.spec === 'string' ? JSON.parse(template.spec) : template.spec;
        await exportToMP4(spec, variant, eventData, artistData, allArtists);
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Error downloading MP4: ' + error.message);
    }
  };

  if (!template?.spec?.variants) {
    return null;
  }

  const spec = typeof template.spec === 'string' ? JSON.parse(template.spec) : template.spec;
  const variants = spec.variants || [];

  return (
    <Card size="3" style={{ position: 'relative' }}>
      <Box 
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 10
        }}
      >
        <Badge variant="soft" size="1">
          {template.kind === 'eventWide' ? 'Event-wide' : 'Per-artist'}
        </Badge>
      </Box>

      <Heading size="4" mb="3">{template.name}</Heading>
      
      {artistData && (
        <Text size="2" color="gray" mb="3">
          For: {artistData.display_name}
        </Text>
      )}

      <Grid columns="1" gap="3">
        {variants.map((variant) => {
          const material = materials[variant.id];
          const isGenerating = generating[variant.id];
          const isReady = material?.status === 'ready';

          return (
            <Box key={variant.id} p="3" style={{ backgroundColor: 'var(--gray-2)', borderRadius: 'var(--radius-2)' }}>
              <Box style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <Text size="2" weight="medium">
                  {variant.id} ({variant.w}×{variant.h})
                </Text>
                {isReady && <CheckCircledIcon color="green" />}
              </Box>

              {/* Thumbnail preview if ready */}
              {isReady && material.thumbnail_url && (
                <Box 
                  mb="3"
                  style={{
                    width: '100%',
                    height: '120px',
                    backgroundImage: `url(${material.thumbnail_url})`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    backgroundColor: 'var(--gray-3)',
                    borderRadius: 'var(--radius-1)'
                  }}
                />
              )}

              <Box style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {!isReady ? (
                  <Button 
                    onClick={() => handleGenerate(variant.id)}
                    disabled={isGenerating}
                    size="2"
                    style={{ flex: 1 }}
                  >
                    {isGenerating ? (
                      <>
                        <Spinner size="1" />
                        Generating...
                      </>
                    ) : (
                      'Generate'
                    )}
                  </Button>
                ) : (
                  <>
                    <Button 
                      onClick={() => handleDownloadPNG(variant.id)}
                      size="2"
                      variant="soft"
                    >
                      <DownloadIcon />
                      PNG
                    </Button>
                    <Button 
                      onClick={() => handleDownloadMP4(variant.id)}
                      size="2"
                      variant="soft"
                    >
                      <PlayIcon />
                      MP4
                    </Button>
                    <Button 
                      onClick={() => handleGenerate(variant.id)}
                      size="2"
                      variant="ghost"
                    >
                      <UpdateIcon />
                    </Button>
                  </>
                )}
              </Box>
            </Box>
          );
        })}
      </Grid>
    </Card>
  );
};

export default TemplateCard;