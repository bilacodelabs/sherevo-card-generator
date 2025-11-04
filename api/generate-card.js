export const config = { runtime: 'nodejs' };
import QRCode from 'qrcode';
import { Resvg } from '@resvg/resvg-js';

// Helper to fill variables in text the card
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

// Generate SVG for the card
async function generateCardSVG(cardDesign, guest, event, eventAttributes = []) {
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

  // Build SVG with positioned elements
  let elementsSVG = '';
  for (const element of cardDesign.text_elements) {
    if (element.type === 'qr_code') {
      const qrSize = element.width || 100;
      const qrDataUrl = qrCodes[element.x + '_' + element.y];
      elementsSVG += `
        <image href="${qrDataUrl}" x="${element.x}" y="${element.y}" width="${qrSize}" height="${qrSize}" />
      `;
    } else {
      const text = escapeForXML(fillCardVariables(element.text, guest, event, eventAttributes));
      const fontWeight = element.fontWeight || 'normal';
      const fontStyle = element.fontStyle || 'normal';
      const textDecoration = element.textDecoration || 'none';
      const textAnchor = (element.textAlign === 'center') ? 'middle' : (element.textAlign === 'right') ? 'end' : 'start';
      const x = element.x;
      const y = element.y + (element.fontSize || 16);
      elementsSVG += `
        <text x="${x}" y="${y}"
          font-size="${element.fontSize || 16}"
          font-family="${element.fontFamily || 'Noto Sans, Arial, Helvetica, sans-serif'}"
          fill="${element.color || '#000000'}"
          font-weight="${fontWeight}"
          font-style="${fontStyle}"
          text-decoration="${textDecoration}"
          text-anchor="${textAnchor}">${text}</text>
      `;
    }
  }

  // If background image is a URL, fetch and embed as data URL so Resvg can render it
  let backgroundHref = '';
  if (cardDesign.background_image) {
    try {
      backgroundHref = await fetchAsDataUrl(cardDesign.background_image);
    } catch (_) {
      backgroundHref = '';
    }
  }

  const bg = backgroundHref
    ? `<image href="${backgroundHref}" x="0" y="0" width="${cardDesign.canvas_width}" height="${cardDesign.canvas_height}" preserveAspectRatio="xMidYMid slice" />`
    : `<rect x="0" y="0" width="${cardDesign.canvas_width}" height="${cardDesign.canvas_height}" fill="#ffffff" />`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${cardDesign.canvas_width}" height="${cardDesign.canvas_height}" viewBox="0 0 ${cardDesign.canvas_width} ${cardDesign.canvas_height}">
      ${bg}
      ${elementsSVG}
    </svg>
  `;
}

function escapeForXML(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function fetchAsDataUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const arrayBuf = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString('base64');
  return `data:${contentType};base64,${base64}`;
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

    // Generate SVG
    const svg = await generateCardSVG(cardDesign, guest, event, eventAttributes || []);

    // Load fonts so text renders in Resvg (fallback to default if fetch fails)
    const fonts = await loadDefaultFonts();

    // Rasterize SVG to PNG
    const resvg = new Resvg(svg, { fitTo: { mode: 'original' }, fonts });
    const png = resvg.render().asPng();
    console.log('Card generated successfully');

    // Return base64 image
    return res.status(200).json({
      success: true,
      image: Buffer.from(png).toString('base64'),
      guest_id: guest.id,
      guest_name: guest.name
    });

  } catch (error) {
    console.error('Error generating card:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      error: 'Failed to generate card',
      message: error.message
    });
  }
}

async function loadDefaultFonts() {
  // Noto Sans regular/bold/italic TTFs hosted on Google Fonts repo (raw)
  const sources = [
    {
      name: 'Noto Sans',
      url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-Regular.ttf',
      weight: 400,
      style: 'normal',
    },
    {
      name: 'Noto Sans',
      url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-Bold.ttf',
      weight: 700,
      style: 'normal',
    },
    {
      name: 'Noto Sans',
      url: 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-Italic.ttf',
      weight: 400,
      style: 'italic',
    },
  ];

  const fonts = [];
  for (const src of sources) {
    try {
      const res = await fetch(src.url);
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      fonts.push({ name: src.name, data: buf, weight: src.weight, style: src.style });
    } catch (_) {
      // ignore
    }
  }

  return { font: fonts.length ? fonts : undefined };
}