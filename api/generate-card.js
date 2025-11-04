import { ImageResponse } from '@vercel/og';
import QRCode from 'qrcode';

export const config = {
  runtime: 'edge',
};

function fillCardVariables(text, guest, event, eventAttributes = []) {
  const cardTypeValue = guest.card_type || '';
  
  let filledText = text
    .replace(/\{\{guest_name\}\}/g, guest.name || '')
    .replace(/\{\{event_name\}\}/g, event.name || '')
    .replace(/\{\{event_date\}\}/g, event.date || '')
    .replace(/\{\{event_time\}\}/g, event.time || '')
    .replace(/\{\{event_venue\}\}/g, event.venue || '')
    .replace(/\{\{plus_one_name\}\}/g, guest.plus_one_name || "")
    .replace(/\{\{card_type\}\}/g, cardTypeValue);

  eventAttributes.forEach(attr => {
    const regex = new RegExp(`\\{\\{${attr.attribute_key}\\}\\}`, 'g');
    filledText = filledText.replace(regex, attr.attribute_value || '');
  });

  return filledText;
}

export default async function handler(req) {
  try {
    const { cardDesign, guest, event, eventAttributes } = await req.json();

    if (!cardDesign || !guest || !event) {
      return new Response(JSON.stringify({
        error: 'Missing required fields'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Generate QR codes
    const qrCodes = {};
    for (const element of cardDesign.text_elements) {
      if (element.type === 'qr_code') {
        const qrSize = element.width || 100;
        qrCodes[element.x + '_' + element.y] = await QRCode.toDataURL(guest.id, {
          width: qrSize,
          margin: 0
        });
      }
    }

    // Build elements
    const elements = cardDesign.text_elements.map((element) => {
      if (element.type === 'qr_code') {
        const qrSize = element.width || 100;
        const qrDataUrl = qrCodes[element.x + '_' + element.y];
        return (
          <img
            key={`qr-${element.x}-${element.y}`}
            src={qrDataUrl}
            style={{
              position: 'absolute',
              left: element.x,
              top: element.y,
              width: qrSize,
              height: qrSize,
            }}
          />
        );
      } else {
        const text = fillCardVariables(element.text, guest, event, eventAttributes || []);
        return (
          <div
            key={`text-${element.x}-${element.y}`}
            style={{
              position: 'absolute',
              left: element.x,
              top: element.y,
              fontSize: element.fontSize,
              fontFamily: element.fontFamily || 'Arial',
              color: element.color || '#000000',
              fontWeight: element.fontWeight || 'normal',
              fontStyle: element.fontStyle || 'normal',
              textDecoration: element.textDecoration || 'none',
              textAlign: element.textAlign || 'left',
            }}
          >
            {text}
          </div>
        );
      }
    });

    // Generate image using @vercel/og
    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            width: cardDesign.canvas_width,
            height: cardDesign.canvas_height,
            display: 'flex',
            position: 'relative',
            backgroundImage: cardDesign.background_image
              ? `url(${cardDesign.background_image})`
              : undefined,
            backgroundColor: '#ffffff',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {elements}
        </div>
      ),
      {
        width: cardDesign.canvas_width,
        height: cardDesign.canvas_height,
      }
    );

    // Convert to base64
    const arrayBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return new Response(JSON.stringify({
      success: true,
      image: base64,
      guest_id: guest.id,
      guest_name: guest.name
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate card',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}