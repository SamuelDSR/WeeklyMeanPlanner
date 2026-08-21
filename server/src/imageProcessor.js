// 上传图片的处理：手机拍的照片动辄 4MB 以上，原图直接存下来会让菜品库越用越慢。
// 上传时统一压成两个尺寸：
//
//   原图 4MB  ->  主图 1600px 长边（详情页用，~200KB）
//              +  缩略图 400px 长边（列表用，~25KB）
//
// 输出一律是 jpeg：进来的可能是 png/webp，出去的体积可控。
import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';

const MAIN = { edge: 1600, quality: 82 };
const THUMB = { edge: 400, quality: 70 };

async function writeVariant(image, { edge, quality }, filePath) {
  await image
    .clone()
    // fit: 'inside' 保持比例缩进这个方框；withoutEnlargement 保证小图不会被放大
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(filePath);
}

// 处理一张上传的图片，返回主图和缩略图的访问地址
export async function processRecipeImage(buffer, uploadDir, baseName) {
  // rotate() 不带参数 = 按 EXIF 里的方向信息把照片摆正。
  // 少了这一步，手机竖着拍的照片在网页上会躺倒。
  const image = sharp(buffer, { failOn: 'none' }).rotate();

  const mainName = `${baseName}.jpg`;
  const thumbName = `${baseName}_thumb.jpg`;
  const mainPath = path.join(uploadDir, mainName);
  const thumbPath = path.join(uploadDir, thumbName);

  try {
    await writeVariant(image, MAIN, mainPath);
    await writeVariant(image, THUMB, thumbPath);
  } catch (err) {
    // 处理失败别在磁盘上留半个文件
    await deleteImageFiles(uploadDir, [mainName, thumbName]);
    throw new Error('这张图片处理不了，换一张试试（支持 jpg / png / webp）');
  }

  return { photoURL: `/uploads/${mainName}`, thumbURL: `/uploads/${thumbName}` };
}

// 删掉图片文件（主图 + 缩略图都走这里），文件本来就不存在也算成功。
// 一律只取 basename：photo_url 是从请求体里存进来的，绝不能让它跳出 uploads 目录。
export async function deleteImageFiles(uploadDir, urlsOrNames) {
  await Promise.all(
    (urlsOrNames || [])
      .filter(Boolean)
      .map((value) => fs.rm(path.join(uploadDir, path.basename(value)), { force: true }))
  );
}
