import {NextRequest,NextResponse} from "next/server";
import {adminFromRequest} from "@/lib/auth-server";
import {db} from "@/lib/db";
import {Prisma} from "@prisma/client";
import {z} from "zod";
export const runtime="nodejs";
const schema=z.object({status:z.enum(["CONFIRMED","PROCESSING","SHIPPED","DELIVERED","CANCELLED"]).optional(),shippingProvider:z.string().trim().max(80).optional().nullable(),trackingNumber:z.string().trim().max(120).optional().nullable(),trackingUrl:z.union([z.string().trim().url().max(1000),z.literal(""),z.null()]).optional()}).refine(v=>v.status!==undefined||v.shippingProvider!==undefined||v.trackingNumber!==undefined||v.trackingUrl!==undefined,{message:"Provide a status or shipment tracking update"});
export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 if(!await adminFromRequest(request))return NextResponse.json({error:"Forbidden"},{status:403});
 const {id}=await params;let body:unknown;try{body=await request.json()}catch{return NextResponse.json({error:"Invalid JSON"},{status:400})}
 const parsed=schema.safeParse(body);if(!parsed.success)return NextResponse.json({error:"Invalid order or tracking update"},{status:400});
 try{const result=await db.$transaction(async tx=>{
  const order=await tx.order.findUnique({where:{id},include:{items:true}});if(!order)throw new Error("NOT_FOUND");
  const data:Prisma.OrderUpdateManyMutationInput={};const {status,shippingProvider,trackingNumber,trackingUrl}=parsed.data;
  if(shippingProvider!==undefined)data.shippingProvider=shippingProvider||null;if(trackingNumber!==undefined)data.trackingNumber=trackingNumber||null;if(trackingUrl!==undefined)data.trackingUrl=trackingUrl||null;
  if(status){if(order.status==="CANCELLED"||order.status==="DELIVERED")throw new Error("TERMINAL_STATUS");
   const transitions:Record<string,string[]>={PENDING:["CONFIRMED","PROCESSING","CANCELLED"],CONFIRMED:["PROCESSING","CANCELLED"],PROCESSING:["SHIPPED","CANCELLED"],SHIPPED:["DELIVERED"],DELIVERED:[],CANCELLED:[]};if(!transitions[order.status]?.includes(status))throw new Error("INVALID_TRANSITION");
   if(status==="SHIPPED"&&!((trackingNumber??order.trackingNumber)?.trim()))throw new Error("TRACKING_REQUIRED");
   if(status==="CANCELLED"){if(order.status==="SHIPPED")throw new Error("ALREADY_SHIPPED");if(order.paymentStatus==="PAID")throw new Error("REFUND_REQUIRED");const changed=await tx.order.updateMany({where:{id,status:order.status,paymentStatus:order.paymentStatus},data:{...data,status:"CANCELLED",paymentStatus:order.paymentStatus==="PENDING"?"FAILED":order.paymentStatus}});if(changed.count!==1)throw new Error("CONCURRENT_UPDATE");for(const item of order.items)await tx.product.update({where:{id:item.productId},data:{stock:{increment:item.quantity}}});}
   else {if(status==="SHIPPED")data.shippedAt=new Date();if(status==="DELIVERED")data.deliveredAt=new Date();const changed=await tx.order.updateMany({where:{id,status:order.status,paymentStatus:order.paymentStatus},data:{...data,status}});if(changed.count!==1)throw new Error("CONCURRENT_UPDATE");}
  }else{if(order.status==="CANCELLED"||order.status==="DELIVERED")throw new Error("TERMINAL_STATUS");await tx.order.update({where:{id},data});}
  return tx.order.findUnique({where:{id},include:{items:true}})
 });return NextResponse.json({order:result})}catch(e){const m=e instanceof Error?e.message:"UNKNOWN";
  if(m==="NOT_FOUND")return NextResponse.json({error:"Order not found"},{status:404});if(m==="REFUND_REQUIRED")return NextResponse.json({error:"Paid orders require a processed refund before cancellation"},{status:409});if(m==="TERMINAL_STATUS")return NextResponse.json({error:"Order is already in a terminal state"},{status:409});if(m==="INVALID_TRANSITION")return NextResponse.json({error:"That order status transition is not allowed"},{status:409});if(m==="ALREADY_SHIPPED")return NextResponse.json({error:"A shipped order cannot be cancelled here"},{status:409});if(m==="TRACKING_REQUIRED")return NextResponse.json({error:"Add the courier tracking number before marking the order shipped"},{status:409});if(m==="CONCURRENT_UPDATE")return NextResponse.json({error:"Order changed in another request. Reload and retry."},{status:409});console.error("Admin order update failed",m);return NextResponse.json({error:"Could not update order"},{status:500});}
}
