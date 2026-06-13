$ErrorActionPreference = "Stop"
$htmlFile = "C:\Users\Ricardo\Desktop\Hotel Lukweku imagens\hotel-lukweku\index.html"
$content = Get-Content $htmlFile -Raw

$imagesHtml = ""
$dir1 = "C:\Users\Ricardo\Desktop\Hotel Lukweku imagens\hotel-lukweku"
$dir2 = "C:\Users\Ricardo\Desktop\Hotel Lukweku imagens\hotel-lukweku\assets\img"

$files1 = Get-ChildItem -Path $dir1 -File | Where-Object { $_.Extension -match "\.(jpg|jpeg|png|webp)$" }
foreach ($f in $files1) {
    if ($f.Name -match "thumbnail|logo") { continue }
    $src = "./" + [uri]::EscapeDataString($f.Name).Replace("%20", " ")
    $imagesHtml += "                <div class=`"break-inside-avoid relative group overflow-hidden bg-ocean border border-white/10 rounded-sm shadow-xl`">`n"
    $imagesHtml += "                    <img src=`"$src`" alt=`"Galeria`" loading=`"lazy`" class=`"w-full h-auto object-cover opacity-0 transition-opacity duration-1000 group-hover:scale-105`" onload=`"this.classList.remove('opacity-0'); this.classList.add('opacity-100');`" onerror=`"this.style.display='none'`">`n"
    $imagesHtml += "                </div>`n"
}

$files2 = Get-ChildItem -Path $dir2 -File | Where-Object { $_.Extension -match "\.(jpg|jpeg|png|webp)$" }
foreach ($f in $files2) {
    if ($f.Name -match "thumbnail|logo") { continue }
    $src = "./assets/img/" + [uri]::EscapeDataString($f.Name).Replace("%20", " ")
    $imagesHtml += "                <div class=`"break-inside-avoid relative group overflow-hidden bg-ocean border border-white/10 rounded-sm shadow-xl`">`n"
    $imagesHtml += "                    <img src=`"$src`" alt=`"Galeria`" loading=`"lazy`" class=`"w-full h-auto object-cover opacity-0 transition-opacity duration-1000 group-hover:scale-105`" onload=`"this.classList.remove('opacity-0'); this.classList.add('opacity-100');`" onerror=`"this.style.display='none'`">`n"
    $imagesHtml += "                </div>`n"
}

$gallerySection = @"

    <!-- 4. GALERIA DE FOTOS COMPLETA -->
    <section id="galeria" class="py-32 bg-oceanDark relative border-t border-white/5">
        <div class="max-w-7xl mx-auto px-6">
            <div class="text-center mb-20 reveal">
                <h2 class="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-4">Galeria Completa</h2>
                <div class="w-20 h-1 bg-cyberCyan mx-auto mb-6"></div>
                <p class="text-white/40 uppercase tracking-widest text-xs font-black">Acervo Visual Completo</p>
            </div>

            <div class="columns-2 md:columns-3 lg:columns-4 gap-4 space-y-4">
$imagesHtml
            </div>
            
            <div class="text-center mt-16">
                <a href="#hotel" class="text-brandYellow text-[11px] font-black uppercase tracking-widest hover:text-white transition">Voltar ao Início &uarr;</a>
            </div>
        </div>
    </section>

"@

$newContent = $content.Replace("<!-- CONTACTO / RODAPÉ OFICIAL -->", "$gallerySection`n    <!-- CONTACTO / RODAPÉ OFICIAL -->")
Set-Content -Path $htmlFile -Value $newContent -Encoding UTF8
Write-Output "Gallery injected successfully"
