import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authenticate } from "@/lib/auth";
import { db } from "@/lib/db";
import { razorpayClient } from "@/lib/razorpay";
import { z } from "zod";
const bodySchema = z.object({items:z.array(z.object({productId:z.string().min(1),quantity:z.number().int().min(1).max(10)})).min(1).max(30),shipping:z.object({name:z.string().min(2).max(100),phone:z.string().min(8).max(20),address1:z.string().min(4).max(200),address2:z.string().max(200).optional(),city:z.string().min(2).max(80),state:z.string().min(2).max(80),postalCode:z.string().min(5).max(10)})});
export async function POST(request:Request){
 try {
  const user=await authenticate(request);
  const parsed=bodySchema.safeParse(await request.json());
  if(!parsed.success) return NextResponse.json({error:"Invalid checkout details"},{status:400});
  const ids=[...new Set(parsed.data.items.map(i=>i.productId))];
  const products=await db.product.findMany({where:{id:{in:ids},status:"ACTIVE",seller:{status:"APPROVED"}}});
  if(products.length!==ids.length) return NextResponse.json({error:"One or more products are unavailable"},{status:409});
  const byId=new Map(products.map(p=>[p.id,p]));
  let subtotal=0;
  const lines=parsed.data.items.map(item=>{const p=byId.get(item.productId)!;if(p.stock<item.quantity)throw new Error("Insufficient stock");subtotal+=p.pricePaise*item.quantity;return {productId:p.id,sellerId:p.sellerId,productName:p.name,unitPricePaise:p.pricePaise,quantity:item.quantity,lineTotalPaise:p.pricePaise*item.quantity};});
  const shipping=Number(process.env.SHIPPING_FLAT_FEE_PAISE);
  if(!Number.isSafeInteger(shipping)||shipping<0) return NextResponse.json({error:"Shipping configuration is invalid"},{status:503});
  const total=subtotal+shipping;
  if(!Number.isSafeInteger(total)||total<1) return NextResponse.json({error:"Invalid order total"},{status:400});
  const order=await db.order.create({data:{orderNumber:`VOO-${Date.now()}-${crypto.randomUUID().slice(0,6).toUpperCase()}`,userId:user.id,subtotalPaise:subtotal,shippingPaise:shipping,totalPaise:total,status:"PENDING_PAYMENT",paymentStatus:"CREATED",paymentExpiresAt:new Date(Date.now()+15*60*1000),shippingName:parsed.data.shipping.name,shippingPhone:parsed.data.shipping.phone,shippingAddress1:parsed.data.shipping.address1,shippingAddress2:parsed.data.shipping.address2,shippingCity:parsed.data.shipping.city,shippingState:parsed.data.shipping.state,shippingPostalCode:parsed.data.shipping.postalCode,items:{create:lines}}});
  try {
   const rp=await razorpayClient().orders.create({amount:total,currency:"INR",receipt:order.orderNumber,notes:{internalOrderId:order.id}});
   await db.order.update({where:{id:order.id},data:{razorpayOrderId:rp.id}});
   return NextResponse.json({orderId:order.id,razorpayOrderId:rp.id,amount:total,currency:"INR",keyId:process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID},{status:201});
  } catch(e){await db.order.update({where:{id:order.id},data:{status:"CANCELLED",paymentStatus:"FAILED"}});throw e;}
 } catch(e){const msg=e instanceof Error?e.message:"Unable to create payment";const status=msg.includes("Authentication")?401:msg==="Forbidden"?403:500;return NextResponse.json({error:status===500?"Unable to start checkout":msg},{status});}
}
