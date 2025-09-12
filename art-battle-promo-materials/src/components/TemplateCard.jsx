import { useState, useEffect } from 'react';
import { 
  Card, 
  Box, 
  Text, 
  Button, 
  Badge, 
  Spinner,
  Grid,
  Heading,
  TextArea,
  Tabs,
  Switch,
  Flex
} from '@radix-ui/themes';
import { DownloadIcon, PlayIcon, UpdateIcon, CheckCircledIcon, CodeIcon, EyeOpenIcon } from '@radix-ui/react-icons';
import { exportToPNG, exportToMP4 } from '../lib/templateRenderer';

const TemplateCard = ({ template, eventData, artistData = null, allArtists = [] }) => {
  const [materials, setMaterials] = useState({}); // variant -> material status
  const [generating, setGenerating] = useState({}); // variant -> generating state
  const [editMode, setEditMode] = useState(false);
  const [editedSpec, setEditedSpec] = useState(null);
  const [livePreview, setLivePreview] = useState(true);

  const supabaseUrl = 'https://xsqdkubgyqwpyvfltnrf.supabase.co';

  // Resize image to reduce payload size before upload
  const resizeImage = (dataUrl, scale) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png', 0.9));
      };
      img.src = dataUrl;
    });
  };

  // Get current spec (edited or original)
  const getCurrentSpec = () => {
    if (editedSpec) return editedSpec;
    return typeof template.spec === 'string' ? JSON.parse(template.spec) : template.spec;
  };

  // CSS Validation - check if CSS selectors match HTML elements
  const validateCSS = (spec) => {
    if (!spec.css || !spec.layers?.textHtml) return { valid: true, warnings: [] };
    
    const warnings = [];
    const cssSelectors = [];
    const htmlClasses = [];
    
    // Extract CSS class selectors (only at start of rules, not in values)
    const cssClassMatches = spec.css.match(/(^|[{}])\s*\.([a-zA-Z][\w-]*)/g);
    if (cssClassMatches) {
      cssSelectors.push(...cssClassMatches.map(s => s.replace(/(^|[{}])\s*\./, ''))); // Extract class name only
    }
    
    // Extract HTML classes
    const htmlClassMatches = spec.layers.textHtml.match(/class="([^"]+)"/g);
    if (htmlClassMatches) {
      htmlClassMatches.forEach(match => {
        const classes = match.replace('class="', '').replace('"', '').split(' ');
        htmlClasses.push(...classes);
      });
    }
    
    // Add classes that are dynamically injected by templateRenderer
    if (spec.dynamicContent?.allArtistsNames) {
      htmlClasses.push('artist-name'); // Added by templateRenderer for all artists
    }
    
    if (spec.dynamicContent?.featuredWithAll) {
      htmlClasses.push('featured-artist', 'other-artists', 'other-artist'); // Added by templateRenderer for featured artist
    }
    
    // Find CSS selectors that don't match any HTML classes
    const orphanedSelectors = cssSelectors.filter(cssClass => !htmlClasses.includes(cssClass));
    const unusedHtmlClasses = htmlClasses.filter(htmlClass => !cssSelectors.includes(htmlClass));
    
    if (orphanedSelectors.length > 0) {
      warnings.push(`CSS classes not found in HTML: ${orphanedSelectors.join(', ')}`);
    }
    
    if (unusedHtmlClasses.length > 0) {
      warnings.push(`HTML classes without CSS: ${unusedHtmlClasses.join(', ')}`);
    }
    
    return {
      valid: warnings.length === 0,
      warnings,
      cssSelectors,
      htmlClasses
    };
  };

  // Handle HTML editing
  const handleHtmlEdit = (newHtml) => {
    const currentSpec = getCurrentSpec();
    const newSpec = {
      ...currentSpec,
      layers: {
        ...currentSpec.layers,
        textHtml: newHtml
      }
    };
    setEditedSpec(newSpec);
  };

  // Handle CSS editing
  const handleCssEdit = (newCss) => {
    const currentSpec = getCurrentSpec();
    const newSpec = {
      ...currentSpec,
      css: newCss
    };
    setEditedSpec(newSpec);
  };

  // Handle dynamic content flags
  const handleDynamicContentEdit = (newFlags) => {
    const currentSpec = getCurrentSpec();
    const newSpec = {
      ...currentSpec,
      dynamicContent: newFlags
    };
    setEditedSpec(newSpec);
  };

  // Create live preview component (similar to templateRenderer but inline)
  const LivePreview = ({ variant, spec }) => {
    const variantSpec = spec.variants?.find(v => v.id === variant.id) || spec.variants?.[0];
    if (!variantSpec) return null;

    const previewId = `live-preview-${template.id}-${variant.id}`;
    const styles = spec.styles || {};
    
    // Build the preview HTML similar to templateRenderer
    const backgroundStyle = artistData?.image_url 
      ? { backgroundImage: `url(${artistData.image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { backgroundColor: '#f0f0f0' };

    return (
      <Box
        id={previewId}
        style={{
          width: '200px',
          height: Math.round((200 * variantSpec.h) / variantSpec.w) + 'px',
          border: '2px solid var(--gray-6)',
          borderRadius: 'var(--radius-2)',
          overflow: 'hidden',
          position: 'relative',
          margin: '12px 0',
          ...backgroundStyle
        }}
      >
        {/* Artist image if available */}
        {artistData?.image_url && (
          <img
            src={artistData.image_url}
            alt="Artist"
            crossOrigin="anonymous"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              zIndex: 1
            }}
          />
        )}
        
        {/* Template content overlay */}
        <Box
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2,
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: variantSpec.contentPosition || 'flex-end',
            color: 'white',
            textShadow: '1px 1px 3px rgba(0,0,0,0.8)'
          }}
        >
          {artistData && (
            <Text size="1" weight="bold">
              {artistData.display_name}
            </Text>
          )}
          <Text size="1">
            {eventData?.title}
          </Text>
        </Box>
        
        {/* Custom CSS overlay */}
        {spec.customCSS && (
          <style dangerouslySetInnerHTML={{
            __html: `#${previewId} { ${spec.customCSS} }`
          }} />
        )}
      </Box>
    );
  };

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

    const spec = getCurrentSpec();
    const variantSpec = spec.variants?.find(v => v.id === variant) || spec.variants?.[0];
    
    if (!variantSpec) {
      alert('Variant not found');
      return;
    }

    setGenerating(prev => ({ ...prev, [variant]: true }));

    try {
      console.log('Starting generation for:', { template: template.name, variant, artist: artistData?.display_name });
      console.log('=== SPEC BEING USED FOR GENERATION ===');
      console.log('CSS:', spec.css);
      console.log('HTML:', spec.layers?.textHtml);
      console.log('Dynamic Content:', spec.dynamicContent);

      // Generate PNG locally first
      const pngDataUrl = await exportToPNG(spec, variant, eventData, artistData, allArtists);
      
      console.log('PNG generated successfully, data URL length:', pngDataUrl.length);

      // Resize to 50% before uploading to reduce payload size
      const resizedDataUrl = await resizeImage(pngDataUrl, 0.5);
      console.log('PNG resized to 50%, new data URL length:', resizedDataUrl.length);

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
        png_data: resizedDataUrl
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
        const spec = getCurrentSpec();
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
        const spec = getCurrentSpec();
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

  const spec = getCurrentSpec();
  const variants = spec.variants || [];

  return (
    <Card size="3" style={{ position: 'relative' }}>
      <Box 
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          zIndex: 10,
          display: 'flex',
          gap: '8px',
          alignItems: 'center'
        }}
      >
        <Button
          size="1"
          variant={editMode ? "solid" : "ghost"}
          onClick={() => setEditMode(!editMode)}
        >
          <CodeIcon />
          {editMode ? 'View' : 'Edit'}
        </Button>
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

      {editMode && (
        <Box mb="4" p="3" style={{ backgroundColor: 'var(--gray-1)', borderRadius: 'var(--radius-2)', border: '1px solid var(--gray-6)' }}>
          <Flex align="center" justify="between" mb="3">
            <Text size="2" weight="medium">Live Editor</Text>
            <Flex align="center" gap="2">
              <Text size="1">Live Preview:</Text>
              <Switch 
                checked={livePreview} 
                onCheckedChange={setLivePreview}
                size="1"
              />
            </Flex>
          </Flex>
          
          <Tabs.Root defaultValue="html">
            <Tabs.List>
              <Tabs.Trigger value="html">HTML Template</Tabs.Trigger>
              <Tabs.Trigger value="css">CSS Styling</Tabs.Trigger>
              <Tabs.Trigger value="data">Data Flags</Tabs.Trigger>
              <Tabs.Trigger value="validate">Validation</Tabs.Trigger>
            </Tabs.List>
            
            <Tabs.Content value="html">
              <Box mb="2">
                <Text size="1" color="gray">
                  Edit the HTML structure. Use IDs like #event-title, #event-venue, #artist-list for dynamic content.
                </Text>
              </Box>
              <TextArea
                placeholder='<div class="container"><h1 id="event-title"></h1><div id="artist-list"></div></div>'
                rows={10}
                value={spec.layers?.textHtml || ''}
                onChange={(e) => handleHtmlEdit(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
            </Tabs.Content>
            
            <Tabs.Content value="css">
              <Box mb="2">
                <Text size="1" color="gray">
                  Style your template with CSS. Target classes and IDs from your HTML.
                </Text>
              </Box>
              <TextArea
                placeholder=".container { padding: 20px; } #event-title { font-size: 48px; color: white; }"
                rows={12}
                value={spec.css || ''}
                onChange={(e) => handleCssEdit(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '12px' }}
              />
            </Tabs.Content>

            <Tabs.Content value="data">
              <Box mb="2">
                <Text size="1" color="gray">
                  Enable dynamic data insertion. Check boxes to populate corresponding IDs.
                </Text>
              </Box>
              <Grid columns="2" gap="2">
                <label>
                  <input 
                    type="checkbox" 
                    checked={spec.dynamicContent?.eventTitle || false}
                    onChange={(e) => handleDynamicContentEdit({
                      ...spec.dynamicContent,
                      eventTitle: e.target.checked
                    })}
                  />
                  <Text size="2" ml="1">Event Title (#event-title)</Text>
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={spec.dynamicContent?.eventVenue || false}
                    onChange={(e) => handleDynamicContentEdit({
                      ...spec.dynamicContent,
                      eventVenue: e.target.checked
                    })}
                  />
                  <Text size="2" ml="1">Venue (#event-venue)</Text>
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={spec.dynamicContent?.eventDateTime || false}
                    onChange={(e) => handleDynamicContentEdit({
                      ...spec.dynamicContent,
                      eventDateTime: e.target.checked
                    })}
                  />
                  <Text size="2" ml="1">Date/Time (#event-time)</Text>
                </label>
                <label>
                  <input 
                    type="checkbox" 
                    checked={spec.dynamicContent?.allArtistsNames || false}
                    onChange={(e) => handleDynamicContentEdit({
                      ...spec.dynamicContent,
                      allArtistsNames: e.target.checked
                    })}
                  />
                  <Text size="2" ml="1">All Artists (#artist-list)</Text>
                </label>
              </Grid>
            </Tabs.Content>

            <Tabs.Content value="validate">
              <Box mb="2">
                <Text size="1" color="gray">
                  CSS/HTML validation and class matching analysis
                </Text>
              </Box>
              {(() => {
                const validation = validateCSS(spec);
                return (
                  <Box>
                    {validation.valid ? (
                      <Box p="3" style={{ backgroundColor: 'var(--green-2)', borderRadius: 'var(--radius-2)', border: '1px solid var(--green-6)' }}>
                        <Text size="2" weight="medium" color="green">✅ CSS and HTML are properly matched</Text>
                      </Box>
                    ) : (
                      <Box p="3" style={{ backgroundColor: 'var(--amber-2)', borderRadius: 'var(--radius-2)', border: '1px solid var(--amber-6)' }}>
                        <Text size="2" weight="medium" color="amber">⚠️ CSS/HTML Mismatches Found:</Text>
                        {validation.warnings.map((warning, index) => (
                          <Box key={index} mt="2">
                            <Text size="1" color="amber">• {warning}</Text>
                          </Box>
                        ))}
                      </Box>
                    )}
                    
                    <Box mt="3">
                      <Text size="1" weight="medium">Available HTML Classes:</Text>
                      <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                        {validation.htmlClasses.join(', ') || 'None found'}
                      </Text>
                    </Box>
                    
                    <Box mt="2">
                      <Text size="1" weight="medium">CSS Classes:</Text>
                      <Text size="1" color="gray" style={{ fontFamily: 'monospace' }}>
                        {validation.cssSelectors.join(', ') || 'None found'}
                      </Text>
                    </Box>
                  </Box>
                );
              })()}
            </Tabs.Content>
          </Tabs.Root>
        </Box>
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