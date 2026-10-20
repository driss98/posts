// Per-site settings. Copy the project for another site and edit this file + wrangler.toml.
export default {
  siteId: 'crochet-demo',            // must be unique per site; CLI tools refuse to run against another siteId
  siteName: 'Crochet Patterns',      // shown small on the Pinterest images
  siteUrl: 'https://example.com',    // public site: article links use this
  articlePath: '/{slug}/',           // public article URL pattern
  mediaBase: '',                     // '' = images are served by this Worker; or e.g. https://cdn.example.com
  imagePrefixes: ['/media/', '/images/'], // image URLs allowed in cards
  uploadMaxMB: 15,
  repostAfterDays: 30,
  brand: {
    primary: '#c2410c', accent: '#0f766e', soft: '#fff7ed', ink: '#1f2937', pastel: '#fde7d9',
    sans: 'Poppins', serif: 'Playfair Display', hand: 'Caveat',
  },
  boards: {
    amigurumi: 'Crochet Amigurumi Patterns', blanket: 'Crochet Blankets & Afghans',
    wearable: 'Crochet Sweaters & Tops', bag: 'Crochet Bags', home: 'Crochet Home Decor',
    baby: 'Crochet for Baby', seasonal: 'Holiday Crochet', square: 'Granny Squares', other: 'Crochet Patterns',
  },
  topicsByType: {
    amigurumi: ['Amigurumi', 'Crochet Toys', 'Crochet Animals'],
    blanket: ['Crochet Blanket', 'Afghan', 'Home Decor'],
    wearable: ['Crochet Clothing', 'Crochet Sweater', 'Crochet Accessories'],
    bag: ['Crochet Bag', 'Crochet Accessories', 'Handmade Gifts'],
    home: ['Crochet Home Decor', 'Handmade Home', 'DIY Home'],
    baby: ['Crochet for Baby', 'Baby Gifts', 'Nursery Decor'],
    seasonal: ['Holiday Crochet', 'Seasonal Crafts', 'Handmade Gifts'],
    square: ['Granny Squares', 'Crochet Motifs', 'Crochet Stitches'],
    other: ['Crochet Projects', 'Handmade', 'DIY'],
  },
};
