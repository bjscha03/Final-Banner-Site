export interface DeliveryProofImage {
  id: string;
  version: number;
  fileName: string;
}

const CLOUDINARY_DELIVERY_ROOT = 'https://res.cloudinary.com/dtrxl120u/image/upload';

/**
 * Customer-submitted delivery photos that were previously reviewed and
 * published on the site. Keep this as an explicit allowlist: never populate a
 * public gallery directly from order records or tracking data.
 */
export const deliveryProofImages: DeliveryProofImage[] = [
  { id: 'delivery-01', version: 1774460966, fileName: 'download_cz20yn.jpg' },
  { id: 'delivery-02', version: 1774460965, fileName: 'download-13_vmyxvp.jpg' },
  { id: 'delivery-03', version: 1774460966, fileName: 'download-16_hck4qs.jpg' },
  { id: 'delivery-04', version: 1774460966, fileName: 'download-18_yyyu7k.jpg' },
  { id: 'delivery-05', version: 1774460966, fileName: 'download-17_htewfz.jpg' },
  { id: 'delivery-06', version: 1774460966, fileName: 'download-15_rpzqgf.jpg' },
  { id: 'delivery-07', version: 1774460966, fileName: 'download-14_y2hhkv.jpg' },
  { id: 'delivery-08', version: 1774460965, fileName: 'download-12_tnp4g2.jpg' },
  { id: 'delivery-09', version: 1774460954, fileName: 'download-10_dknhmc.jpg' },
  { id: 'delivery-10', version: 1774460954, fileName: 'download-9_hpdvaf.jpg' },
  { id: 'delivery-11', version: 1774460954, fileName: 'download-11_hxfr9e.jpg' },
  { id: 'delivery-12', version: 1774460953, fileName: 'download-7_eoowij.jpg' },
  { id: 'delivery-13', version: 1774460953, fileName: 'download-8_xlfbuv.jpg' },
  { id: 'delivery-14', version: 1774460953, fileName: 'download-1_un1zb8.jpg' },
  { id: 'delivery-15', version: 1774460953, fileName: 'download-4_mags5c.jpg' },
  { id: 'delivery-16', version: 1774460953, fileName: 'download-3_sokqqv.jpg' },
  { id: 'delivery-17', version: 1774460953, fileName: 'download-6_xtzq7z.jpg' },
  { id: 'delivery-18', version: 1774460953, fileName: 'download-2_pzrd1q.jpg' },
  { id: 'delivery-19', version: 1774460953, fileName: 'download-5_wolqqp.jpg' },
  { id: 'delivery-20', version: 1776363042, fileName: 'download_qidyrl.jpg' },
  { id: 'delivery-21', version: 1776363042, fileName: 'download-3_qfh54f.jpg' },
  { id: 'delivery-22', version: 1776363042, fileName: 'download-1_yffld3.jpg' },
  { id: 'delivery-23', version: 1776363042, fileName: 'download-2_scks5q.jpg' },
  { id: 'delivery-24', version: 1790629467, fileName: 'bof-deliveries/2026-09-28/delivery-01.jpg' },
  { id: 'delivery-25', version: 1790629470, fileName: 'bof-deliveries/2026-09-28/delivery-02.jpg' },
  { id: 'delivery-26', version: 1790629472, fileName: 'bof-deliveries/2026-09-28/delivery-03.jpg' },
  { id: 'delivery-27', version: 1790629475, fileName: 'bof-deliveries/2026-09-28/delivery-04.jpg' },
  { id: 'delivery-28', version: 1790629478, fileName: 'bof-deliveries/2026-09-28/delivery-05.jpg' },
  { id: 'delivery-29', version: 1790629481, fileName: 'bof-deliveries/2026-09-28/delivery-06.jpg' },
  { id: 'delivery-30', version: 1790629484, fileName: 'bof-deliveries/2026-09-28/delivery-07.jpg' },
  { id: 'delivery-31', version: 1790629487, fileName: 'bof-deliveries/2026-09-28/delivery-08.jpg' },
  { id: 'delivery-32', version: 1790629489, fileName: 'bof-deliveries/2026-09-28/delivery-09.jpg' },
  { id: 'delivery-33', version: 1790629492, fileName: 'bof-deliveries/2026-09-28/delivery-10.jpg' },
  { id: 'delivery-34', version: 1790629494, fileName: 'bof-deliveries/2026-09-28/delivery-11.jpg' },
  { id: 'delivery-35', version: 1790629455, fileName: 'bof-deliveries/2026-09-28/delivery-12.jpg' },
  { id: 'delivery-36', version: 1790630730, fileName: 'bof-deliveries/2026-09-28/delivery-13.jpg' },
  { id: 'delivery-37', version: 1790630733, fileName: 'bof-deliveries/2026-09-28/delivery-14.png' },
  { id: 'delivery-38', version: 1790630737, fileName: 'bof-deliveries/2026-09-28/delivery-15.png' },
  { id: 'delivery-39', version: 1790630740, fileName: 'bof-deliveries/2026-09-28/delivery-16.png' },
  { id: 'delivery-40', version: 1790630743, fileName: 'bof-deliveries/2026-09-28/delivery-17.png' },
  { id: 'delivery-41', version: 1790630747, fileName: 'bof-deliveries/2026-09-28/delivery-18.png' },
  { id: 'delivery-42', version: 1790630750, fileName: 'bof-deliveries/2026-09-28/delivery-19.png' },
  { id: 'delivery-43', version: 1790630753, fileName: 'bof-deliveries/2026-09-28/delivery-20.png' },
  { id: 'delivery-44', version: 1790630757, fileName: 'bof-deliveries/2026-09-28/delivery-21.png' },
  { id: 'delivery-45', version: 1790630760, fileName: 'bof-deliveries/2026-09-28/delivery-22.png' },
];

export const featuredDeliveryProofImages = deliveryProofImages.slice(0, 6);

export const getDeliveryProofImageUrl = (
  image: DeliveryProofImage,
  transformation: string,
): string =>
  `${CLOUDINARY_DELIVERY_ROOT}/${transformation}/v${image.version}/${image.fileName}`;
