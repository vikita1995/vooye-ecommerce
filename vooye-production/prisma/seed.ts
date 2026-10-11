import { PrismaClient } from "@prisma/client";
const db=new PrismaClient();
async function main(){
 const email=process.env.SEED_SELLER_EMAIL;
 const uid=process.env.SEED_SELLER_FIREBASE_UID;
 if(!email||!uid){console.log("Seed skipped: set SEED_SELLER_EMAIL and SEED_SELLER_FIREBASE_UID to create demo seller.");return;}
 const user=await db.user.upsert({where:{firebaseUid:uid},update:{email},create:{firebaseUid:uid,email,role:"SELLER"}});
 const seller=await db.seller.upsert({where:{userId:user.id},update:{},create:{userId:user.id,storeName:"Vooye Demo Studio",slug:"vooye-demo-studio",status:"APPROVED"}});
 await db.product.upsert({where:{slug:"arched-full-length-mirror"},update:{},create:{sellerId:seller.id,slug:"arched-full-length-mirror",name:"Arched Full-Length Mirror",category:"Full-length mirrors",description:"A clean arched mirror for bedrooms and entryways.",pricePaise:849900,stock:12,status:"ACTIVE"}});
 console.log("Demo seller and product seeded.");
}
main().finally(()=>db.$disconnect());
