export const MAX_PDF = 25000000;
export function ticket(text) {
 const t=JSON.parse(text);
 if(!t||(t.kind!==undefined&&!['sb','anoc'].includes(t.kind))||!/^H\d{4}-\d{3}-\d{1,3}$/.test(t.plan)||!Number.isInteger(t.year)||t.year<2000||t.year>2099||!/^https:\/\/www\.uhc\.com\/medicare\/alphadog\/[A-Za-z0-9_-]+$/.test(t.url)||!/^[-\w]{43}$/.test(t.token))throw Error('Invalid capture code. Generate a new code in Chat Mode.');
 return t;
}
export async function pdfBytes(blob) {
 if(!blob.size||blob.size>MAX_PDF)throw Error('Select a public PDF under 25 MB.');
 const bytes=new Uint8Array(await blob.arrayBuffer());
 if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('The response is not a PDF; no data was sent.');
 return bytes;
}
