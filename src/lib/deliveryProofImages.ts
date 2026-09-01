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
];

export const featuredDeliveryProofImages = deliveryProofImages.slice(0, 6);

export const getDeliveryProofImageUrl = (
  image: DeliveryProofImage,
  transformation: string,
): string =>
  `${CLOUDINARY_DELIVERY_ROOT}/${transformation}/v${image.version}/${image.fileName}`;
