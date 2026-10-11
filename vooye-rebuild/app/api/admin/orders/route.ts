import {NextRequest,NextResponse} from "next/server";import {adminFromRequest} from "@/lib/auth-server";import {db} from "@/lib/db";
export const runtime="nodejs";
export async function GET(request:NextRequest){if(!await adminFromRequest(request))return NextResponse.json({error:"Forbidden"},{status:403});const orders=await db.order.findMany({include:{items:true,customer:{select:{email:true,name:true}}},orderBy:{createdAt:"desc"},take:100});return NextResponse.json({orders})}
