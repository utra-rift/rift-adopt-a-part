# Budget additions (items 33–42)

Items the captain added after the 2026–27 budget, as listed on the site. Prices seen on
2026-10-28 with delivery to Toronto (M5G). CAD listings are before tax and are × 1.13 for
HST; USD prices are × 1.3864 CAD/USD × 1.13, the same method as the budget. Shipping is
excluded except for the PCBs. **Quantities are estimates from the robot's design.**

| # | Listing | What's in it | CAD incl. HST |
|---|---|---|---|
| 33 | PCBs | 3 rounds × (3 boards at JLCPCB, about US$30 of components, US$26.77 DDP shipping) | 342.00 |
| 34 | Bearings | 1 × KA040XP0 four-point-contact, 101.6 × 114.3 × 6.35 mm (yaw); 2 × KA020XP0, 50.8 × 63.5 × 6.35 mm (pitch); 70-piece miniature bearing assortment; 6800-2RS 10-pack | 206.60 |
| 35 | Metal | 2 × 6061 sheet 1/4 in 12 × 12 in; 2 × 6061 sheet 1/8 in 12 × 12 in; 2 × 6061 round bar 1 in × 12 in; M3 standoffs (48) and spacers (65) | 194.42 |
| 36 | Filament | 2 kg Polymaker PA6-CF20 for gimbal and launcher prints | 169.48 |
| 37 | Slip ring | Flanged capsule, 22 mm OD: 1 × gigabit Ethernet, 2 × 20 A, 2 × 2 A | 159.32 |
| 38 | Wire | BNTECHGO silicone wire: 12 AWG 10 ft, 14 AWG 20 ft, 18 AWG 25 ft, 22 AWG 10-colour kit | 99.69 |
| 39 | Hardware | M2–M5 socket head assortment (1,760), M3–M8 nylock nuts (150), blind rivets with riveter (226), zip ties (1,000) | 97.81 |
| 40 | Crimper | Engineer PA-09 (may be borrowed) | 73.17 |
| 41 | Connectors | Amass XT30U (20 pairs), XT60H (10 pairs), JST-GH housings and contacts kit | 66.72 |
| 42 | Friction wheels | 1 kg TPU 95A for printed treads on nylon-CF hubs | 29.37 |
| | **Total** | | **1,438.58** |

## Sources

- Slip ring: [AliExpress 1005010691475992](https://www.aliexpress.com/item/1005010691475992.html), "with flange", C$140.99. Fallback with 100 Mbps Ethernet and 8 rings, rated 250 rpm: [AliExpress 1522866364](https://www.aliexpress.com/item/1522866364.html), C$118.68.
- Bearings: [KA040/KA020 four-point-contact (unbranded KA series)](https://www.aliexpress.com/item/1005005605294711.html), C$67.68 and C$35.58 each (20% sale; regular C$84.60 and C$44.48); [70-piece assortment](https://www.amazon.ca/dp/B0H5X4F9LB) C$26.99; [6800-2RS 10-pack](https://www.amazon.ca/dp/B0B5XPBFH5) C$16.99.
- Aluminium: [1/4 in 12 × 12, 2-pack](https://www.amazon.ca/dp/B08JPDD98P) C$54.19; [1/8 in 12 × 12, 2-pack](https://www.amazon.ca/dp/B09B7Y8WLT) C$39.99; [1 in round bar, 2-pack](https://www.amazon.ca/dp/B0CF228CTC) C$29.89; [M3 standoffs](https://www.amazon.ca/dp/B0DNF8YJLH) C$22.99; [M3 spacers](https://www.amazon.ca/dp/B0DNF9ZYY6) C$24.99.
- Filament: [PA6-CF20 1 kg](https://www.amazon.ca/dp/B0GK8H35VW) C$74.99 each; [TPU 95A 1 kg](https://www.amazon.ca/dp/B0841CKM6F) C$25.99.
- Wire: [12 AWG](https://www.amazon.ca/dp/B08Q4493TZ) C$21.24; [14 AWG](https://www.amazon.ca/dp/B01AO7586O) C$28.33; [18 AWG](https://www.amazon.ca/dp/B07HGTKQ89) C$19.82; [22 AWG kit](https://www.amazon.ca/dp/B01M0O1NXM) C$18.83.
- Hardware: [screw assortment](https://www.amazon.ca/dp/B0C38YFL3D) C$28.99; [nylock nuts](https://www.amazon.ca/dp/B0DDPQT674) C$10.98; [rivets and riveter](https://www.amazon.ca/dp/B0BC996X99) C$20.59; [zip ties](https://www.amazon.ca/dp/B0C4BBV6WV) C$25.99.
- Connectors: [XT30U](https://www.amazon.ca/dp/B08H1JP7NW) C$15.99; [XT60H](https://www.amazon.ca/dp/B074PN6N4K) C$17.68; [JST-GH kit](https://www.amazon.ca/dp/B0D49X837M) C$25.37; [crimper](https://www.amazon.ca/dp/B002AVVO7K) C$64.75.
- PCBs: [JLCPCB quote](https://cart.jlcpcb.com/quote), 100 × 100 mm, 5 pcs, US$4 (2-layer) or US$8 (4-layer); UPS DDP to Toronto US$26.77. Components per round are an estimate (no BOM yet).

## Open questions for the team

1. PCBs: how many rounds and boards per round? (3 × 3 assumed.)
2. Does the 4 kg of nylon-CF in item 28 already cover the gimbal and launcher prints? If so, item 36 double counts.
3. Bearing sizes against the CAD: is the yaw motor on the axis (the slip ring needs the centre free) and do the pitch hubs fit a 50.8 mm bore?
4. Slip ring speed: how fast does the turret turn relative to the chassis while spinning in place? Ask the seller for the recommended ring's rpm rating.
5. Where do the Pi and camera sit? That decides Ethernet vs USB through the slip ring.
6. Does the $113 supercap line (item 17) cover both the cells and the controller board? Spare cells would add about $65.
