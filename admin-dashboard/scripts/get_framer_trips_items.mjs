import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { EventSource } from 'eventsource';

global.EventSource = EventSource;
const MCP_URL='https://mcp.unframer.co/sse?id=73506ef3a425ea9adf787e19fc7caddc64fe18181bcc24132d988e0397845253&secret=lxsqy1Gm5ZSDmnDuqflUOUhthJg00lBZ';
const COLLECTION_ID='Z1Bphf6oI';
const transport=new SSEClientTransport(new URL(MCP_URL));
const client=new Client({name:'framer-items',version:'1.0.0'},{capabilities:{}});
await client.connect(transport);
const r=await client.callTool({name:'getCMSItems',arguments:{collectionId:COLLECTION_ID,limit:500}});
const txt=(r.content||[]).map(c=>c.text||'').join('\n');
const parsed=JSON.parse(txt);
const items=(parsed.items||[]).map(it=>({id:it.id,slug:it.slug,title:(it.fieldData?.edpZYc3f0?.value??it.fieldData?.edpZYc3f0??''),trip_id:(it.fieldData?.sOpVBzQ8v?.value??it.fieldData?.sOpVBzQ8v??''),base_price:(it.fieldData?.L131_KPPt?.value??it.fieldData?.L131_KPPt??null),active:(it.fieldData?.dkXJnSrLi?.value??it.fieldData?.dkXJnSrLi??null)}));
console.log(JSON.stringify(items,null,2));
await client.close();
