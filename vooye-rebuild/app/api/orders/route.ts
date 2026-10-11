import {NextRequest,NextResponse} from "next/server";
import {userFromRequest} from "@/lib/auth-server";
import {createOrder} from "@/lib/order-service";
import {rateLimit} from "@/lib/rate-limit";
import {getRazorpay} from "@/lib/razorpay";
import {db} from "@/lib/db";
import {ZodError} from "zod";
export const runtime="nodejs";
export async function POST(request:NextRequest){
  const ip=request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
  const limit=rateLimit(`order:${ip}`,8,60_000);
  if(!limit.ok)return NextResponse.json({error:"Too many requests. Please retry shortly."},{status:429,headers:{"Retry-After":String(limit.retryAfter)}});
  const user=await userFromRequest(request);
  if(!user)return NextResponse.json({error:"Please sign in before placing an order."},{status:401});
  let body:unknown;try{body=await request.json()}catch{return NextResponse.json({error:"Invalid JSON body."},{status:400})}
  const method=(body && typeof body === "object" && "paymentMethod" in body)?(body as {paymentMethod?:unknown}).paymentMethod:undefined;
  const razorpay=method==="RAZORPAY"?getRazorpay():null;
  if(method!=="RAZORPAY")return NextResponse.json({error:"Vooye currently accepts Razorpay online payments only."},{status:400});
  if(!razorpay || !process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID)return NextResponse.json({error:"Online payments are not configured. Please try again later."},{status:503});
  let order;
  try{
    order=await createOrder(user.uid,user.email,body);
    if(order.paymentMethod==="RAZORPAY"){
      const client=razorpay!;
      try{
        const providerOrder=await client.orders.create({amount:order.totalPaise,currency:"INR",receipt:order.orderNumber,notes:{vooyeOrderId:order.id,orderNumber:order.orderNumber}});
        await db.order.update({where:{id:order.id},data:{paymentProviderId:providerOrder.id}});
        return NextResponse.json({order:{orderNumber:order.orderNumber,status:order.status,totalPaise:order.totalPaise,currency:"INR"},razorpay:{key:process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,orderId:providerOrder.id,amount:providerOrder.amount,currency:providerOrder.currency,name:process.env.NEXT_PUBLIC_STORE_NAME||"Vooye",description:`Order ${order.orderNumber}`,prefill:{name:order.recipientName,email:user.email||"",contact:order.phone}}},{status:201});
      }catch(error){
        await db.$transaction(async tx=>{await tx.order.update({where:{id:order!.id},data:{status:"CANCELLED",paymentStatus:"FAILED"}});for(const item of order!.items)await tx.product.update({where:{id:item.productId},data:{stock:{increment:item.quantity}}})});
        console.error("Razorpay order creation failed",error instanceof Error?error.message:"unknown error");
        return NextResponse.json({error:"Could not start online payment. No order was placed; please retry later."},{status:502});
      }
    }
    return NextResponse.json({error:"Unsupported payment method."},{status:400});
  }catch(error){
    if(error instanceof ZodError)return NextResponse.json({error:"Please check the checkout fields and quantities."},{status:400});
    const message=error instanceof Error?error.message:"UNKNOWN";
    if(["OUT_OF_STOCK","PRODUCT_UNAVAILABLE"].includes(message))return NextResponse.json({error:"One or more products are unavailable or have insufficient stock. Refresh your cart."},{status:409});
    if(message==="QUANTITY_LIMIT")return NextResponse.json({error:"Maximum quantity per product is 10."},{status:400});
    if(message==="SHIPPING_NOT_CONFIGURED")return NextResponse.json({error:"Shipping charges are not configured yet. Please contact Vooye support."},{status:503});
    console.error("Create order failed",{message});return NextResponse.json({error:"Unable to place your order right now."},{status:500});
  }
}
