import {NextRequest,NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {db} from "@/lib/db";
export const runtime="nodejs";
type RazorEvent={event?:string;payload?:{payment?:{entity?:{id?:string;order_id?:string;amount?:number;currency?:string;status?:string}};order?:{entity?:{id?:string;amount?:number;currency?:string;status?:string}}}};
export async function POST(request:NextRequest){
  const secret=process.env.RAZORPAY_WEBHOOK_SECRET;if(!secret)return NextResponse.json({error:"Webhook is not configured"},{status:503});
  const signature=request.headers.get("x-razorpay-signature");const eventId=request.headers.get("x-razorpay-event-id");if(!signature||!eventId)return NextResponse.json({error:"Missing signature or event ID"},{status:400});
  const raw=Buffer.from(await request.arrayBuffer());const digest=createHmac("sha256",secret).update(raw).digest();let provided:Buffer;try{provided=Buffer.from(signature,"hex")}catch{return NextResponse.json({error:"Invalid signature"},{status:400})}
  if(provided.length!==digest.length||!timingSafeEqual(provided,digest))return NextResponse.json({error:"Invalid signature"},{status:400});
  let event:RazorEvent;try{event=JSON.parse(raw.toString("utf8")) as RazorEvent}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
  if(!["payment.captured","order.paid"].includes(event.event||""))return NextResponse.json({received:true,ignored:true});
  const payment=event.payload?.payment?.entity;const providerOrderId=payment?.order_id||event.payload?.order?.entity?.id;const amount=payment?.amount??event.payload?.order?.entity?.amount;const currency=payment?.currency??event.payload?.order?.entity?.currency;
  if(!providerOrderId)return NextResponse.json({error:"Missing provider order reference"},{status:400});
  try{
    await db.$transaction(async tx=>{
      await tx.processedWebhook.create({data:{provider:"razorpay",eventId}});
      const order=await tx.order.findFirst({where:{paymentProviderId:providerOrderId}});
      if(!order)throw new Error("ORDER_NOT_FOUND");
      if(amount!==order.totalPaise||currency!==order.currency)throw new Error("PAYMENT_AMOUNT_MISMATCH");
      if(order.paymentStatus!=="PAID")await tx.order.update({where:{id:order.id},data:order.status==="CANCELLED"?{paymentStatus:"PAID"}:{paymentStatus:"PAID",status:"CONFIRMED"}});
    });
    return NextResponse.json({received:true});
  }catch(error){
    if(error&&typeof error==="object"&&"code" in error&&(error as {code?:string}).code==="P2002")return NextResponse.json({received:true,duplicate:true});
    console.error("Razorpay webhook processing failed",error instanceof Error?error.message:"unknown error");
    return NextResponse.json({error:"Webhook processing failed"},{status:500});
  }
}
