# Rebuild the native splash from the unchanged, original Flowie PNG.
# Uses the locally installed font to rasterize a wordmark; no font is bundled.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

public static class LifeFlowSplashArtwork
{
    public static void Generate(string sourcePath, string outputPath)
    {
        const int canvasSize = 1024;
        const float imageWidth = 200f;
        const float mascotHeight = 600f;
        const float gap = 36f;
        using (var source = new Bitmap(sourcePath))
        using (var canvas = new Bitmap(canvasSize, canvasSize, PixelFormat.Format32bppArgb))
        using (var graphics = Graphics.FromImage(canvas))
        using (var family = new FontFamily("Arial Rounded MT Bold"))
        using (var text = new GraphicsPath())
        using (var brush = new SolidBrush(ColorTranslator.FromHtml("#892325")))
        {
            if (family.Name != "Arial Rounded MT Bold")
                throw new InvalidOperationException("Use the intended installed font; do not silently substitute artwork.");
            int left = source.Width, top = source.Height, right = -1, bottom = -1;
            for (int y = 0; y < source.Height; y++)
                for (int x = 0; x < source.Width; x++)
                    if (source.GetPixel(x, y).A > 0)
                    {
                        left = Math.Min(left, x); top = Math.Min(top, y);
                        right = Math.Max(right, x); bottom = Math.Max(bottom, y);
                    }
            if (right < left) throw new InvalidOperationException("Original mascot is empty.");
            var crop = Rectangle.FromLTRB(left, top, right + 1, bottom + 1);
            text.AddString("LifeFlow", family, (int)FontStyle.Regular, 128f, PointF.Empty, StringFormat.GenericTypographic);
            var textBounds = text.GetBounds();
            float contentHeight = mascotHeight + gap + textBounds.Height;
            float contentTop = (canvasSize - contentHeight) / 2f;
            float mascotWidth = crop.Width * mascotHeight / crop.Height;

            graphics.Clear(Color.Transparent);
            graphics.CompositingQuality = CompositingQuality.HighQuality;
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;
            graphics.SmoothingMode = SmoothingMode.AntiAlias;
            graphics.DrawImage(source, new RectangleF((canvasSize - mascotWidth) / 2f, contentTop, mascotWidth, mascotHeight), crop, GraphicsUnit.Pixel);
            using (var placement = new Matrix())
            {
                placement.Translate((canvasSize - textBounds.Width) / 2f - textBounds.Left,
                    contentTop + mascotHeight + gap - textBounds.Top);
                text.Transform(placement);
            }
            graphics.FillPath(brush, text);
            graphics.Flush();

            // Android's 288 dp splash canvas masks outside a 192 dp diameter circle.
            // Keep every painted pixel at least 6 dp inside it at imageWidth=200.
            double maxRadiusSquared = 0;
            for (int y = 0; y < canvasSize; y++)
                for (int x = 0; x < canvasSize; x++)
                    if (canvas.GetPixel(x, y).A > 0)
                    {
                        double dx = x + 0.5 - canvasSize / 2.0, dy = y + 0.5 - canvasSize / 2.0;
                        maxRadiusSquared = Math.Max(maxRadiusSquared, dx * dx + dy * dy);
                    }
            double paintedRadiusDp = Math.Sqrt(maxRadiusSquared) * imageWidth / canvasSize;
            if (paintedRadiusDp > 90)
                throw new InvalidOperationException("Splash artwork exceeds the Android safe-circle padding.");
            canvas.Save(outputPath, ImageFormat.Png);
            Console.WriteLine("Generated 1024x1024 transparent Flowie + LifeFlow lockup; painted radius {0:F2} dp / 96 dp mask.", paintedRadiusDp);
        }
    }
}
'@
$projectRoot = Split-Path -Parent $PSScriptRoot
[LifeFlowSplashArtwork]::Generate(
    (Join-Path $projectRoot 'assets/images/LogoMascot.png'),
    (Join-Path $projectRoot 'assets/images/splash-lockup.png')
)
