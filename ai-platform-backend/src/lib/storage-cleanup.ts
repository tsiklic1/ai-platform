/**
 * Centralized storage cleanup helpers. Every DELETE endpoint funnels through
 * here so the `brand-assets` bucket never accumulates orphaned files.
 *
 * Philosophy: log-and-proceed. Storage removal is best-effort — failures are
 * logged but never block the DB delete. The worst case is a true orphan; the
 * common case is a clean bucket.
 */

import { createUserClient } from "./supabase";

type SB = ReturnType<typeof createUserClient>;

const BUCKET = "brand-assets";

/**
 * Bulk-remove objects from the brand-assets bucket. No-op if the list is
 * empty. Logs failures but never throws, so callers can safely continue with
 * their DB delete.
 */
export async function deleteStorageFiles(
  sb: SB,
  paths: string[],
  logContext: string
): Promise<void> {
  if (paths.length === 0) return;

  const { error } = await sb.storage.from(BUCKET).remove(paths);

  if (error) {
    console.error(
      `[storage-cleanup] ${logContext}: failed to remove ${paths.length} file(s): ${error.message}`
    );
    return;
  }

  console.log(
    `[storage-cleanup] ${logContext}: removed ${paths.length} file(s)`
  );
}

/** Paths for every brand_product_image belonging to one product. */
export async function collectProductStoragePaths(
  sb: SB,
  productId: string
): Promise<string[]> {
  const { data, error } = await sb
    .from("brand_product_images")
    .select("storage_path")
    .eq("product_id", productId);

  if (error) {
    console.error(
      `[storage-cleanup] collectProductStoragePaths(${productId}) query failed: ${error.message}`
    );
    return [];
  }

  return (data ?? [])
    .map((row: { storage_path: string | null }) => row.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}

/** Paths for every content_type_image belonging to one content type. */
export async function collectContentTypeStoragePaths(
  sb: SB,
  contentTypeId: string
): Promise<string[]> {
  const { data, error } = await sb
    .from("content_type_images")
    .select("storage_path")
    .eq("content_type_id", contentTypeId);

  if (error) {
    console.error(
      `[storage-cleanup] collectContentTypeStoragePaths(${contentTypeId}) query failed: ${error.message}`
    );
    return [];
  }

  return (data ?? [])
    .map((row: { storage_path: string | null }) => row.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}

/** Paths for every generated_frame belonging to one frame set. */
export async function collectFrameSetStoragePaths(
  sb: SB,
  frameSetId: string
): Promise<string[]> {
  const { data, error } = await sb
    .from("generated_frames")
    .select("storage_path")
    .eq("frame_set_id", frameSetId);

  if (error) {
    console.error(
      `[storage-cleanup] collectFrameSetStoragePaths(${frameSetId}) query failed: ${error.message}`
    );
    return [];
  }

  return (data ?? [])
    .map((row: { storage_path: string | null }) => row.storage_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
}

/**
 * Paths for every storage-backed row under one brand:
 *   - product images    (via brand_products.brand_id)
 *   - content type imgs (via content_types.brand_id)
 *   - generated images  (brand_id column)
 *   - generated frames  (via generated_frame_sets.brand_id)
 *
 * All four queries run in parallel.
 */
export async function collectBrandStoragePaths(
  sb: SB,
  brandId: string
): Promise<string[]> {
  // Product images — need to resolve product_ids first since brand_product_images
  // doesn't have a direct brand_id column.
  const productImagesPromise = (async (): Promise<string[]> => {
    const { data: products, error: productErr } = await sb
      .from("brand_products")
      .select("id")
      .eq("brand_id", brandId);

    if (productErr) {
      console.error(
        `[storage-cleanup] collectBrandStoragePaths: brand_products query failed: ${productErr.message}`
      );
      return [];
    }
    const productIds = (products ?? []).map((p: { id: string }) => p.id);
    if (productIds.length === 0) return [];

    const { data, error } = await sb
      .from("brand_product_images")
      .select("storage_path")
      .in("product_id", productIds);

    if (error) {
      console.error(
        `[storage-cleanup] collectBrandStoragePaths: brand_product_images query failed: ${error.message}`
      );
      return [];
    }
    return (data ?? [])
      .map((row: { storage_path: string | null }) => row.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
  })();

  // Content type images — resolve content_type ids first for the same reason.
  const contentTypeImagesPromise = (async (): Promise<string[]> => {
    const { data: cts, error: ctErr } = await sb
      .from("content_types")
      .select("id")
      .eq("brand_id", brandId);

    if (ctErr) {
      console.error(
        `[storage-cleanup] collectBrandStoragePaths: content_types query failed: ${ctErr.message}`
      );
      return [];
    }
    const ctIds = (cts ?? []).map((ct: { id: string }) => ct.id);
    if (ctIds.length === 0) return [];

    const { data, error } = await sb
      .from("content_type_images")
      .select("storage_path")
      .in("content_type_id", ctIds);

    if (error) {
      console.error(
        `[storage-cleanup] collectBrandStoragePaths: content_type_images query failed: ${error.message}`
      );
      return [];
    }
    return (data ?? [])
      .map((row: { storage_path: string | null }) => row.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
  })();

  // Generated images — direct brand_id column.
  const generatedImagesPromise = (async (): Promise<string[]> => {
    const { data, error } = await sb
      .from("generated_images")
      .select("storage_path")
      .eq("brand_id", brandId);

    if (error) {
      console.error(
        `[storage-cleanup] collectBrandStoragePaths: generated_images query failed: ${error.message}`
      );
      return [];
    }
    return (data ?? [])
      .map((row: { storage_path: string | null }) => row.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
  })();

  // Generated frames — resolve frame_set ids first.
  const generatedFramesPromise = (async (): Promise<string[]> => {
    const { data: sets, error: setErr } = await sb
      .from("generated_frame_sets")
      .select("id")
      .eq("brand_id", brandId);

    if (setErr) {
      console.error(
        `[storage-cleanup] collectBrandStoragePaths: generated_frame_sets query failed: ${setErr.message}`
      );
      return [];
    }
    const setIds = (sets ?? []).map((s: { id: string }) => s.id);
    if (setIds.length === 0) return [];

    const { data, error } = await sb
      .from("generated_frames")
      .select("storage_path")
      .in("frame_set_id", setIds);

    if (error) {
      console.error(
        `[storage-cleanup] collectBrandStoragePaths: generated_frames query failed: ${error.message}`
      );
      return [];
    }
    return (data ?? [])
      .map((row: { storage_path: string | null }) => row.storage_path)
      .filter((p): p is string => typeof p === "string" && p.length > 0);
  })();

  const [productImages, contentTypeImages, generatedImages, generatedFrames] =
    await Promise.all([
      productImagesPromise,
      contentTypeImagesPromise,
      generatedImagesPromise,
      generatedFramesPromise,
    ]);

  return [
    ...productImages,
    ...contentTypeImages,
    ...generatedImages,
    ...generatedFrames,
  ];
}
