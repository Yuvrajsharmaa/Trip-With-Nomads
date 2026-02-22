/* sync_supabase_slugs.mjs */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log("Starting Supabase Slug Updates...");

    console.log("Updating Kedarnath 3N slug to kedarnath-yatra...");
    const { error: err2 } = await supabase.from('trips').update({ slug: 'kedarnath-yatra' }).eq('id', '2f0ea5c3-f8d4-4c2f-9156-b2ad011fca7d');
    if (err2) console.error("Error updating kedarnath-yatra:", err2);
            
    console.log("Updating Kedarnath With Badrinath 4N slug to do-dhaam...");
    const { error: err3 } = await supabase.from('trips').update({ slug: 'do-dhaam' }).eq('id', '74497b7e-8d3d-49dc-afd5-c09c268d048d');
    if (err3) console.error("Error updating do-dhaam:", err3);
            
    console.log("Updating Bali with Gili T. slug to bali-with-nusa-gili-t...");
    const { error: err5 } = await supabase.from('trips').update({ slug: 'bali-with-nusa-gili-t' }).eq('id', '341c59dc-8934-451c-8b9e-66c99445f2ec');
    if (err5) console.error("Error updating bali-with-nusa-gili-t:", err5);
            
    console.log("Updating Teen Taal 3N slug to teen-taal...");
    const { error: err6 } = await supabase.from('trips').update({ slug: 'teen-taal' }).eq('id', 'bc006aec-a940-47cc-93c8-a56c6bcba83b');
    if (err6) console.error("Error updating teen-taal:", err6);
            
    console.log("Updating Baku slug to baku-without-shahdag...");
    const { error: err7 } = await supabase.from('trips').update({ slug: 'baku-without-shahdag' }).eq('id', '1d081900-96e7-491d-b30e-0f637476b40d');
    if (err7) console.error("Error updating baku-without-shahdag:", err7);
            
    console.log("Updating Baku slug to baku-with-shahdag...");
    const { error: err8 } = await supabase.from('trips').update({ slug: 'baku-with-shahdag' }).eq('id', '1d081900-96e7-491d-b30e-0f637476b40d');
    if (err8) console.error("Error updating baku-with-shahdag:", err8);
            
    console.log("Updating Veitnam slug to vietnam...");
    const { error: err9 } = await supabase.from('trips').update({ slug: 'vietnam' }).eq('id', '2cd68b3f-bbae-41d4-93e6-b77f70119855');
    if (err9) console.error("Error updating vietnam:", err9);
            
    console.log("Updating Sangla Holi 3N 4D slug to sangla-holi-special...");
    const { error: err11 } = await supabase.from('trips').update({ slug: 'sangla-holi-special' }).eq('id', '23fc4e0e-40e3-4767-81c8-9dc6bdcd7608');
    if (err11) console.error("Error updating sangla-holi-special:", err11);
            
    console.log("Updating Spiti With Sangla 6N 7D slug to spiti-valley-with-sangla-holi...");
    const { error: err13 } = await supabase.from('trips').update({ slug: 'spiti-valley-with-sangla-holi' }).eq('id', 'e0615ffb-27d0-48c8-9cf7-0acbb16204a0');
    if (err13) console.error("Error updating spiti-valley-with-sangla-holi:", err13);
            
    console.log("Updating Thailand  Songkaran slug to thailand-songkran-festival...");
    const { error: err14 } = await supabase.from('trips').update({ slug: 'thailand-songkran-festival' }).eq('id', '3efb8866-7ac1-4b96-a8c6-7c2e5496843c');
    if (err14) console.error("Error updating thailand-songkran-festival:", err14);
            
    console.log("Updating Winter spiti slug to winter-spiti-expedition...");
    const { error: err15 } = await supabase.from('trips').update({ slug: 'winter-spiti-expedition' }).eq('id', 'a1b86c67-45e9-4193-a645-ea1a74d0af09');
    if (err15) console.error("Error updating winter-spiti-expedition:", err15);
            
    console.log("Updating Thailand Full Moon slug to thailand-full-moon-party...");
    const { error: err18 } = await supabase.from('trips').update({ slug: 'thailand-full-moon-party' }).eq('id', 'fae90e04-3c77-4878-9b6b-a5f1e7e37fa7');
    if (err18) console.error("Error updating thailand-full-moon-party:", err18);
            
    console.log("Supabase Updates Complete.");
}
run();
