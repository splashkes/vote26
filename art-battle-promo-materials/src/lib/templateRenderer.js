import { toPng } from 'html-to-image';

// Convert external image to CORS-compatible data URL using canvas
const imageToDataUrl = async (url) => {
  return new Promise((resolve) => {
    const img = new Image();
    
    // Set crossOrigin to anonymous to attempt CORS loading
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        ctx.drawImage(img, 0, 0);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        console.log('Successfully converted image to data URL');
        resolve(dataUrl);
      } catch (error) {
        console.warn('Canvas conversion failed (likely CORS):', error);
        resolve(null);
      }
    };
    
    img.onerror = () => {
      console.warn('Failed to load image:', url);
      resolve(null);
    };
    
    img.src = url;
  });
};

// Template data substitution
export const substituteTemplateData = (template, eventData, artistData = null, allArtists = []) => {
  let html = template;
  
  // Replace event placeholders
  if (eventData) {
    const eventDate = eventData.event_date ? new Date(eventData.event_date) : null;
    const formattedDate = eventDate ? eventDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) : '';
    
    const shortDate = eventDate ? eventDate.toLocaleDateString('en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).toUpperCase() : '';

    html = html.replace(/{event\.title}/g, eventData.title || '');
    html = html.replace(/{event\.city}/g, eventData.city || '');
    html = html.replace(/{event\.venue}/g, eventData.venue || '');
    html = html.replace(/{event\.date}/g, formattedDate);
    html = html.replace(/{event\.shortdate}/g, shortDate);
    html = html.replace(/{event\.eid}/g, eventData.eid || '');
    
    // Handle template format without escaping
    html = html.replace(/{event.title}/g, eventData.title || '');
    html = html.replace(/{event.city}/g, eventData.city || '');
    html = html.replace(/{event.venue}/g, eventData.venue || '');
    html = html.replace(/{event.date}/g, formattedDate);
    html = html.replace(/{event.shortdate}/g, shortDate);
    html = html.replace(/{event.eid}/g, eventData.eid || '');
  }
  
  // Replace artist placeholders
  if (artistData) {
    html = html.replace(/{artist\.display_name}/g, artistData.display_name || '');
    html = html.replace(/{artist\.sample_asset_url}/g, artistData.sample_asset_url || '');
    
    // Handle template format without escaping
    html = html.replace(/{artist.display_name}/g, artistData.display_name || '');
    html = html.replace(/{artist.sample_asset_url}/g, artistData.sample_asset_url || '');
  }
  
  return html;
};

// Create render root element
export const createRenderRoot = (spec, variant, eventData, artistData = null, allArtists = []) => {
  console.log('=== CREATING RENDER ROOT ===');
  console.log('Template spec:', spec);
  console.log('Variant requested:', variant);
  console.log('Event data:', eventData);
  console.log('Artist data:', artistData);
  console.log('All artists:', allArtists?.length || 0);
  
  const variantSpec = spec.variants?.find(v => v.id === variant) || spec.variants?.[0];
  if (!variantSpec) {
    console.error('No variant found:', { variant, availableVariants: spec.variants });
    throw new Error(`Variant ${variant} not found in template`);
  }
  
  console.log('Using variant spec:', variantSpec);
  
  // Create unique ID for this render to avoid CSS conflicts
  const renderId = `render-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Create container
  const container = document.createElement('div');
  container.id = renderId;
  container.style.cssText = `
    position: absolute;
    top: -10000px;
    left: -10000px;
    width: ${variantSpec.w}px;
    height: ${variantSpec.h}px;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
    overflow: hidden;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  
  console.log('Container created with ID:', renderId);
  console.log('Container dimensions:', { w: variantSpec.w, h: variantSpec.h });
  
  // Create underlay if specified
  if (spec.layers?.underlay) {
    const underlay = document.createElement('div');
    underlay.className = 'underlay';
    underlay.style.cssText = `
      position: absolute;
      inset: 0;
      background-size: ${spec.layers.underlay.fit || 'cover'};
      background-position: center;
      background-repeat: no-repeat;
      z-index: 1;
    `;
    
    // Get the actual image URL from artist or event data
    let imageUrl = artistData?.sample_asset_url || eventData?.bgFallback || '';
    
    console.log('=== UNDERLAY SETUP ===');
    console.log('Original image URL:', imageUrl);
    
    // Check if we have a real image URL
    if (imageUrl) {
      console.log('Using real image from unified sample works');
      
      // Check the domain to determine CORS compatibility
      try {
        const imageHost = new URL(imageUrl).hostname;
        console.log('Image host:', imageHost);
        
        // Cloudflare imagedelivery.net and artbattle.com should work
        const corsCompatible = [
          'imagedelivery.net',
          'artbattle.com'
        ].some(domain => imageHost.includes(domain));
        
        if (corsCompatible) {
          console.log('Image appears to be CORS-compatible, using directly');
          underlay.style.background = `linear-gradient(45deg, rgba(220, 38, 127, 0.3), rgba(255, 107, 157, 0.3)), url(${imageUrl})`;
        } else {
          console.log('Image may have CORS issues, using with gradient overlay');
          underlay.style.background = `linear-gradient(45deg, rgba(220, 38, 127, 0.6), rgba(255, 107, 157, 0.6)), url(${imageUrl})`;
        }
      } catch (error) {
        console.warn('Error parsing image URL:', error);
        underlay.style.background = `linear-gradient(45deg, rgba(220, 38, 127, 0.8), rgba(255, 107, 157, 0.8))`;
      }
    } else {
      console.log('No image URL available, using solid gradient');
      underlay.style.background = `linear-gradient(45deg, rgba(220, 38, 127, 0.8), rgba(255, 107, 157, 0.8))`;
    }
    
    underlay.style.backgroundSize = 'cover';
    underlay.style.backgroundPosition = 'center';
    
    console.log('Underlay CSS applied:', underlay.style.cssText);
    container.appendChild(underlay);
    console.log('Underlay appended to container');
  }
  
  // Create text layer
  if (spec.layers?.textHtml) {
    console.log('=== TEXT LAYER SETUP ===');
    console.log('Original textHtml:', spec.layers.textHtml);
    
    const textLayer = document.createElement('div');
    textLayer.className = 'text-layer';
    textLayer.style.cssText = `
      position: relative;
      z-index: 2;
      width: 100%;
      height: 100%;
    `;
    
    let processedHtml = substituteTemplateData(spec.layers.textHtml, eventData, artistData, allArtists);
    
    // Handle dynamic content injection
    if (spec.dynamicContent?.allArtistsNames && allArtists?.length > 0) {
      console.log('Injecting all artists names into template');
      const artistNames = allArtists.map(artist => 
        `<div class="artist-name">${artist.display_name || artist.name}</div>`
      ).join('');
      processedHtml = processedHtml.replace(
        '<div class="all-artists" id="artist-list"></div>', 
        `<div class="all-artists" id="artist-list">${artistNames}</div>`
      );
    }
    
    // Handle featured artist with all artists
    if (spec.dynamicContent?.featuredWithAll && artistData && allArtists?.length > 0) {
      console.log('Injecting featured artist with all artists');
      const featuredName = `<div class="featured-artist">${artistData.display_name}</div>`;
      const otherArtists = allArtists
        .filter(artist => artist.id !== artistData.id)
        .map(artist => `<div class="other-artist">${artist.display_name || artist.name}</div>`)
        .join('');
      
      processedHtml = processedHtml.replace(
        '<div class="featured-list" id="featured-artist-list"></div>',
        `<div class="featured-list" id="featured-artist-list">${featuredName}<div class="other-artists">${otherArtists}</div></div>`
      );
    }
    
    console.log('Processed HTML:', processedHtml);
    textLayer.innerHTML = processedHtml;
    
    console.log('Text layer created:', textLayer);
    console.log('Text layer innerHTML:', textLayer.innerHTML);
    container.appendChild(textLayer);
    console.log('Text layer appended to container');
  }
  
  // Apply CSS with light scoping
  if (spec.css) {
    console.log('=== CSS APPLICATION ===');
    console.log('Original CSS:', spec.css);
    
    const style = document.createElement('style');
    let scopedCSS = spec.css;
    
    // FIXED APPROACH: Only replace class selectors at the start of rules
    scopedCSS = scopedCSS.replace(/(^|[,}]\s*)(\.[\w-]+)/g, `$1#${renderId} $2`);
    
    // Also ensure the container styles work
    scopedCSS = `
      #${renderId} {
        position: absolute !important;
        top: -10000px !important;
        left: -10000px !important;
        width: ${variantSpec.w}px !important;
        height: ${variantSpec.h}px !important;
        overflow: hidden !important;
        font-family: system-ui, -apple-system, sans-serif !important;
      }
      ${scopedCSS}
    `;
    
    console.log('=== FINAL SCOPED CSS ===');
    console.log(scopedCSS);
    
    style.textContent = scopedCSS;
    document.head.appendChild(style);
    console.log('CSS style element added to head');
    
    // Store reference to clean up later
    container._styleElement = style;
  } else {
    console.log('No CSS found in template spec');
  }
  
  // Load custom fonts if specified
  if (spec.assets?.fonts && spec.assets.fonts.length > 0) {
    spec.assets.fonts.forEach(font => {
      const fontFace = new FontFace(font.family, `url(${font.src})`, {
        weight: font.weight || 'normal'
      });
      
      fontFace.load().then(() => {
        document.fonts.add(fontFace);
        console.log('Font loaded:', font.family);
      }).catch(err => {
        console.warn('Failed to load font:', font.family, err);
      });
    });
  }
  
  console.log('=== RENDER ROOT COMPLETE ===');
  console.log('Final container:', container);
  console.log('Container children count:', container.children.length);
  console.log('Container HTML:', container.outerHTML.substring(0, 500) + '...');
  
  return container;
};

// Export PNG
export const exportToPNG = async (spec, variant, eventData, artistData = null, allArtists = []) => {
  return new Promise((resolve, reject) => {
    try {
      console.log('Starting PNG export:', { template: spec.name, variant, event: eventData?.title });
      
      const container = createRenderRoot(spec, variant, eventData, artistData, allArtists);
      document.body.appendChild(container);
      
      // Wait for fonts and images to load
      setTimeout(async () => {
        try {
          const variantSpec = spec.variants?.find(v => v.id === variant) || spec.variants?.[0];
          
          console.log('Capturing PNG with dimensions:', { 
            w: variantSpec.w, 
            h: variantSpec.h, 
            pixelRatio: variantSpec.pixelRatio || 2 
          });
          
          // TEMPORARILY move container to visible area for capture
          // First remove the CSS that has !important positioning
          if (container._styleElement) {
            container._styleElement.disabled = true;
          }
          
          container.style.cssText = `
            position: absolute !important;
            top: 0px !important;
            left: 0px !important;
            width: ${variantSpec.w}px !important;
            height: ${variantSpec.h}px !important;
            background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%) !important;
            overflow: hidden !important;
            font-family: system-ui, -apple-system, sans-serif !important;
            z-index: 9999 !important;
          `;
          
          // Force style recalculation
          container.offsetHeight;
          
          console.log('Container moved to visible area for capture');
          console.log('Container position after move:', {
            top: container.style.top,
            left: container.style.left,
            position: container.style.position
          });
          console.log('Container bounds:', container.getBoundingClientRect());
          
          // Wait for all images in the container to load
          const images = container.querySelectorAll('img');
          const imagePromises = Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve; // Continue even if image fails
            });
          });
          
          await Promise.all(imagePromises);
          console.log('All images loaded, waiting additional time for background images...');
          
          // Wait additional time for background images to load
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('Starting PNG capture...');
          
          // Force a repaint before capturing
          container.offsetHeight; // Trigger reflow
          
          const dataUrl = await toPng(container, {
            width: variantSpec.w,
            height: variantSpec.h,
            pixelRatio: variantSpec.pixelRatio || 2,
            backgroundColor: '#1a1a1a', // Dark background like our container
            quality: 0.9,
            style: {
              transform: 'none',
              margin: '0',
              padding: '0'
            },
            filter: (node) => {
              // Exclude certain node types that might cause issues
              if (node.nodeType === Node.COMMENT_NODE) {
                return false;
              }
              return true;
            }
          });
          
          console.log('PNG capture dataUrl length:', dataUrl.length);
          console.log('PNG capture dataUrl preview:', dataUrl.substring(0, 100) + '...');
          
          // Re-enable the CSS and move container back off-screen
          if (container._styleElement) {
            container._styleElement.disabled = false;
          }
          
          container.style.top = '-10000px';
          container.style.left = '-10000px';
          
          // Clean up
          if (container._styleElement) {
            document.head.removeChild(container._styleElement);
          }
          document.body.removeChild(container);
          
          // Trigger download
          const filename = `${spec.name.replace(/\s+/g, '_')}_${variant}_${artistData?.display_name?.replace(/\s+/g, '_') || 'event'}.png`;
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          link.click();
          
          console.log('PNG export completed successfully');
          resolve(dataUrl);
        } catch (err) {
          console.error('PNG export error:', err);
          // Clean up on error
          if (container._styleElement) {
            document.head.removeChild(container._styleElement);
          }
          if (document.body.contains(container)) {
            document.body.removeChild(container);
          }
          reject(err);
        }
      }, 2000); // Increased wait time for assets to load
      
    } catch (err) {
      console.error('PNG export setup error:', err);
      reject(err);
    }
  });
};

// Export MP4 with animated rotating background
export const exportToMP4 = async (spec, variant, eventData, artistData = null, allArtists = []) => {
  console.log('Starting MP4 export with rotating background:', { template: spec.name, variant, event: eventData?.title });
  
  return new Promise(async (resolve, reject) => {
    try {
      const variantSpec = spec.variants?.find(v => v.id === variant) || spec.variants?.[0];
      if (!variantSpec) {
        throw new Error(`Variant ${variant} not found`);
      }

      // Create canvas for video recording
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = variantSpec.w;
      canvas.height = variantSpec.h;
      
      console.log('Canvas created:', { width: canvas.width, height: canvas.height });

      // Get background image URL
      let imageUrl = artistData?.sample_asset_url || eventData?.bgFallback || '';
      let backgroundImage = null;
      
      // Load background image if available
      if (imageUrl) {
        console.log('Loading background image for animation:', imageUrl);
        backgroundImage = new Image();
        backgroundImage.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          backgroundImage.onload = () => {
            console.log('Background image loaded for animation');
            resolve();
          };
          backgroundImage.onerror = () => {
            console.warn('Failed to load background image for animation');
            backgroundImage = null;
            resolve(); // Continue without image
          };
          backgroundImage.src = imageUrl;
        });
      }

      // Create text layer by capturing just the text elements
      let textCanvas = null;
      if (spec.layers?.textHtml) {
        console.log('Creating text-only layer for video...');
        
        // Create a container with ONLY the text layer (no background)
        const textOnlyContainer = document.createElement('div');
        textOnlyContainer.style.cssText = `
          position: absolute;
          top: 0px;
          left: 0px;
          width: ${variantSpec.w}px;
          height: ${variantSpec.h}px;
          font-family: system-ui, -apple-system, sans-serif;
          visibility: visible;
          z-index: 9999;
          background: transparent;
        `;
        
        // Add only the text content
        const textLayer = document.createElement('div');
        textLayer.className = 'text-layer';
        textLayer.style.cssText = `
          position: relative;
          z-index: 2;
          width: 100%;
          height: 100%;
          background: transparent;
        `;
        
        let processedHtml = substituteTemplateData(spec.layers.textHtml, eventData, artistData, allArtists);
        
        // Handle dynamic content for video
        if (spec.dynamicContent?.allArtistsNames && allArtists?.length > 0) {
          const artistNames = allArtists.map(artist => 
            `<div class="artist-name">${artist.display_name || artist.name}</div>`
          ).join('');
          processedHtml = processedHtml.replace(
            '<div class="all-artists" id="artist-list"></div>', 
            `<div class="all-artists" id="artist-list">${artistNames}</div>`
          );
        }
        
        textLayer.innerHTML = processedHtml;
        textOnlyContainer.appendChild(textLayer);
        
        // Apply CSS styles but scoped to this container
        if (spec.css) {
          const tempId = `text-only-${Date.now()}`;
          textOnlyContainer.id = tempId;
          
          const style = document.createElement('style');
          let scopedCSS = spec.css;
          // Scope CSS to this container only and make background transparent
          scopedCSS = scopedCSS.replace(/(^|[,}]\s*)(\.[\w-]+)/g, `$1#${tempId} $2`);
          
          // Override any background styles to be transparent
          scopedCSS = `
            #${tempId} {
              position: absolute !important;
              top: 0px !important;
              left: 0px !important;
              width: ${variantSpec.w}px !important;
              height: ${variantSpec.h}px !important;
              background: transparent !important;
              overflow: visible !important;
              font-family: system-ui, -apple-system, sans-serif !important;
            }
            #${tempId} .underlay {
              display: none !important;
            }
            ${scopedCSS}
          `;
          
          style.textContent = scopedCSS;
          document.head.appendChild(style);
          textOnlyContainer._styleElement = style;
        }
        
        document.body.appendChild(textOnlyContainer);
        
        // Wait for rendering to complete
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        try {
          console.log('Capturing text-only layer...');
          
          // Capture just the text elements with transparent background
          const textDataUrl = await toPng(textOnlyContainer, {
            width: variantSpec.w,
            height: variantSpec.h,
            backgroundColor: 'transparent',
            pixelRatio: 1,
            style: {
              background: 'transparent'
            }
          });
          
          // Create canvas for text layer
          textCanvas = document.createElement('canvas');
          const textCtx = textCanvas.getContext('2d');
          textCanvas.width = variantSpec.w;
          textCanvas.height = variantSpec.h;
          
          // Load the rendered text as an image
          const textImg = new Image();
          await new Promise((resolve) => {
            textImg.onload = () => {
              textCtx.drawImage(textImg, 0, 0);
              console.log('Text-only layer rendered to canvas successfully');
              resolve();
            };
            textImg.onerror = () => {
              console.warn('Failed to load text-only layer image');
              resolve();
            };
            textImg.src = textDataUrl;
          });
          
        } catch (err) {
          console.warn('Failed to render text-only layer:', err);
        }
        
        // Clean up
        if (textOnlyContainer._styleElement) {
          document.head.removeChild(textOnlyContainer._styleElement);
        }
        document.body.removeChild(textOnlyContainer);
      }

      // Set up MediaRecorder
      const stream = canvas.captureStream(30); // 30 FPS
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp9' // Try VP9 first, fallback to VP8
      });
      
      const chunks = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('MediaRecorder stopped, creating video blob');
        const blob = new Blob(chunks, { type: 'video/webm' });
        
        // Download the video
        const filename = `${spec.name.replace(/\s+/g, '_')}_${variant}_${artistData?.display_name?.replace(/\s+/g, '_') || 'event'}.webm`;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = filename;
        link.href = url;
        link.click();
        
        // Clean up
        URL.revokeObjectURL(url);
        
        console.log('MP4 (WebM) export completed successfully');
        resolve(url);
      };

      // Animation parameters
      let rotation = 0;
      const duration = 3000; // 3 seconds
      const fps = 30;
      const totalFrames = (duration / 1000) * fps;
      let frame = 0;

      // Start recording
      console.log('Starting video recording...');
      mediaRecorder.start();

      // Animation loop
      const animate = () => {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw rotating background
        ctx.save();
        
        // Move to center for rotation
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rotation);
        
        if (backgroundImage) {
          // Draw background image with rotation
          const scale = Math.max(
            (canvas.width * 1.5) / backgroundImage.width,
            (canvas.height * 1.5) / backgroundImage.height
          );
          const scaledWidth = backgroundImage.width * scale;
          const scaledHeight = backgroundImage.height * scale;
          
          ctx.drawImage(
            backgroundImage,
            -scaledWidth / 2,
            -scaledHeight / 2,
            scaledWidth,
            scaledHeight
          );
        } else {
          // Draw rotating gradient background
          const gradient = ctx.createLinearGradient(-canvas.width, -canvas.height, canvas.width, canvas.height);
          gradient.addColorStop(0, 'rgba(220, 38, 127, 0.8)');
          gradient.addColorStop(1, 'rgba(255, 107, 157, 0.8)');
          ctx.fillStyle = gradient;
          ctx.fillRect(-canvas.width, -canvas.height, canvas.width * 2, canvas.height * 2);
        }
        
        ctx.restore();
        
        // Draw text layer on top (non-rotating)
        if (textCanvas) {
          ctx.drawImage(textCanvas, 0, 0);
        }
        
        // Update rotation (one full rotation over duration)
        rotation += (2 * Math.PI) / totalFrames;
        frame++;
        
        if (frame < totalFrames) {
          requestAnimationFrame(animate);
        } else {
          // Stop recording
          console.log('Animation complete, stopping recording...');
          mediaRecorder.stop();
        }
      };

      // Start animation
      animate();

    } catch (error) {
      console.error('MP4 export error:', error);
      reject(error);
    }
  });
};

// Generate preview (smaller scale for gallery)
export const generatePreview = async (spec, variant, eventData, artistData = null) => {
  try {
    console.log('Generating preview:', { template: spec.name, variant, event: eventData?.title });
    
    const container = createRenderRoot(spec, variant, eventData, artistData);
    const variantSpec = spec.variants?.find(v => v.id === variant) || spec.variants?.[0];
    
    if (!variantSpec) {
      throw new Error(`Variant ${variant} not found`);
    }
    
    // Position for preview capture (visible area)
    container.style.position = 'absolute';
    container.style.top = '-5000px';  // Less negative for preview
    container.style.left = '-5000px';
    container.style.zIndex = '-1000';
    
    document.body.appendChild(container);
    
    return new Promise((resolve, reject) => {
      setTimeout(async () => {
        try {
          // Capture at 50% scale for preview
          const dataUrl = await toPng(container, {
            width: variantSpec.w,
            height: variantSpec.h,
            pixelRatio: 0.5, // Half resolution for preview
            backgroundColor: 'transparent'
          });
          
          // Clean up
          if (container._styleElement) {
            document.head.removeChild(container._styleElement);
          }
          document.body.removeChild(container);
          
          console.log('Preview generated successfully');
          resolve(dataUrl);
        } catch (err) {
          console.error('Preview generation error:', err);
          // Clean up on error
          if (container._styleElement) {
            document.head.removeChild(container._styleElement);
          }
          if (document.body.contains(container)) {
            document.body.removeChild(container);
          }
          reject(err);
        }
      }, 1500); // Increased wait time for preview generation
    });
  } catch (err) {
    console.error('Preview setup error:', err);
    throw err;
  }
};