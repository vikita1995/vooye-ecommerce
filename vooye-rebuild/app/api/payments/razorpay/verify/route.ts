import {NextRequest,NextResponse} from "next/server";
import {createHmac,timingSafeEqual} from "node:crypto";
import {userFromRequest} from "@/lib/auth-server";
import {db} from "@/lib/db";
import {getRazorpay} from "@/lib/razorpay";
export const runtime="nodejs";
export async function POST(request:NextRequest){
  const user=await userFromRequest(request);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const razorpay=getRazorpay();const secret=process.env.RAZORPAY_KEY_SECRET;if(!razorpay||!secret)return NextResponse.json({error:"Online payments are not configured"},{status:503});
  let body:{orderNumber?:string;razorpay_order_id?:string;razorpay_payment_id?:string;razorpay_signature?:string};try{body=await request.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
  const {orderNumber,razorpay_order_id,razorpay_payment_id,razorpay_signature}=body;
  if(!orderNumber||!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return NextResponse.json({error:"Missing payment verification fields"},{status:400});
  const order=await db.order.findFirst({where:{orderNumber,customer:{firebaseUid:user.uid}}});
  if(!order||order.paymentMethod!=="RAZORPAY"||order.paymentProviderId!==razorpay_order_id)return NextResponse.json({error:"Order does not match this payment"},{status:404});
  const expected=createHmac("sha256",secret).update(`${razorpay_order_id}|${razorpay_payment_id}`).digest();let provided:Buffer;try{provided=Buffer.from(razorpay_signature,"hex")}catch{return NextResponse.json({error:"Invalid signature"},{status:400})}
  if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return NextResponse.json({error:"Payment signature verification failed"},{status:400});
  try{
    const payment=await razorpay.payments.fetch(razorpay_payment_id) as unknown as {order_id?:string;amount?:number;currency?:string;status?:string};
    if(payment.order_id!==order.paymentProviderId||payment.amount!==order.totalPaise||payment.currency!==order.currency||payment.status!=="captured")return NextResponse.json({error:"Payment is not captured or amount does not match"},{status:409});
    const updated=await db.order.update({where:{id:order.id,paymentStatus:{not:"PAID"}},data:order.status==="CANCELLED"?{paymentStatus:"PAID"}:{paymentStatus:"PAID",status:"CONFIRMED"}}).catch(async()=>db.order.findUnique({where:{id:order.id}}));
    if(!updated||updated.paymentStatus!=="PAID")return NextResponse.json({error:"Unable to confirm payment yet. Contact support with your order number."},{status:409});
    if(order.status==="CANCELLED")return NextResponse.json({verified:false,paymentStatus:"PAID",error:"Payment was captured for a cancelled order. Contact support immediately with the order number for refund assistance."},{status:409});
    return NextResponse.json({verified:true,orderNumber:order.orderNumber,paymentStatus:"PAID"});
  }catch(error){console.error("Razorpay verification failed",error instanceof Error?error.message:"unknown error");return NextResponse.json({error:"Unable to verify payment; the webhook may still update the order. Keep your order number."},{status:502})}
}
