import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import QRCode from 'qrcode';

// Helper to fill variables in text
function fillCardVariables(text, guest, event, eventAttributes = []) {
  const cardTypeValue = guest.card_type || '';
  
  let filledText = text
    .replace(/\{\{guest_name\}\}/g, guest.name || '')
    .replace(/\{\{event_name\}\}/g, event.name || '')
    .replace(/\{\{event_date\}\}/g, event.date || '')
    .replace(/\{\{event_time\}\}/g, event.time || '')
    .replace(/\{\{event_venue\}\}/g, event.venue || '')
    .replace(/\{\{plus_one_name\}\}/g, guest.plus_one_name || "")
    .replace(/\{\{card_type\}\}/g, cardTypeValue)
    .replace(/\{\{qr_code\}\}/g, guest.id || '');

  // Replace event attribute variables
  eventAttributes.forEach(attr => {
    const regex = new RegExp(`\\{\\{${attr.attribute_key}\\}\\}`, 'g');
    filledText = filledText.replace(regex, attr.attribute_value || '');
  });

  return filledText;
}

// Generate HTML for the card
async function generateCardHTML(cardDesign, guest, event, eventAttributes = []) {
  // Generate QR code data URLs for all QR elements
  const qrCodes = {};
  for (const element of cardDesign.text_elements) {
    if (element.type === 'qr_code') {
      const qrSize = element.width || 100;
      qrCodes[element.x + '_' + element.y] = await QRCode.toDataURL(guest.id, {
        width: qrSize,
        margin: 0,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    }
  }

  // Build HTML with inline styles
  let elementsHTML = '';
  for (const element of cardDesign.text_elements) {
    if (element.type === 'qr_code') {
      const qrSize = element.width || 100;
      const qrDataUrl = qrCodes[element.x + '_' + element.y];
      elementsHTML += `
        <img 
          src="${qrDataUrl}" 
          style="position: absolute; left: ${element.x}px; top: ${element.y}px; width: ${qrSize}px; height: ${qrSize}px;"
        />
      `;
    } else {
      const text = fillCardVariables(element.text, guest, event, eventAttributes);
      const fontWeight = element.fontWeight || 'normal';
      const fontStyle = element.fontStyle || 'normal';
      const textDecoration = element.textDecoration || 'none';
      const textAlign = element.textAlign || 'left';
      
      elementsHTML += `
        <div style="
          position: absolute; 
          left: ${element.x}px; 
          top: ${element.y}px; 
          font-size: ${element.fontSize}px; 
          font-family: ${element.fontFamily || 'Arial'}; 
          color: ${element.color || '#000000'};
          font-weight: ${fontWeight};
          font-style: ${fontStyle};
          text-decoration: ${textDecoration};
          text-align: ${textAlign};
          white-space: pre-wrap;
        ">${text}</div>
      `;
    }
  }

  const backgroundStyle = cardDesign.background_image 
    ? `background-image: url('${cardDesign.background_image}'); background-size: cover; background-position: center;`
    : 'background-color: #ffffff;';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { margin: 0; padding: 0; }
      </style>
    </head>
    <body>
      <div style="
        width: ${cardDesign.canvas_width}px; 
        height: ${cardDesign.canvas_height}px; 
        position: relative;
        ${backgroundStyle}
        overflow: hidden;
      ">
        ${elementsHTML}
      </div>
    </body>
    </html>
  `;
}

// Main serverless function handler
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let browser;
  
  try {
    const { cardDesign, guest, event, eventAttributes } = req.body;

    // Validate required fields
    if (!cardDesign || !guest || !event) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'cardDesign, guest, and event are required'
      });
    }

    console.log('Generating card for guest:', guest.name);

    // Generate HTML content
    const html = await generateCardHTML(cardDesign, guest, event, eventAttributes || []);

    // Launch browser (uses Chromium for serverless)
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    
    // Set viewport to match card dimensions
    await page.setViewport({
      width: cardDesign.canvas_width,
      height: cardDesign.canvas_height,
      deviceScaleFactor: 2 // Higher quality
    });

    // Load the HTML
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Take screenshot
    const screenshot = await page.screenshot({
      type: 'png',
      encoding: 'base64',
      fullPage: true
    });

    await browser.close();

    // Return base64 image
    return res.status(200).json({
      success: true,
      image: screenshot, // Base64 string without prefix
      guest_id: guest.id,
      guest_name: guest.name
    });

  } catch (error) {
    console.error('Error generating card:', error);
    
    if (browser) {
      await browser.close().catch(console.error);
    }

    return res.status(500).json({
      error: 'Failed to generate card',
      message: error.message
    });
  }
}