# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: roulette-mobile.spec.ts >> roulette betting controls on rotation >> keeps OPEN and LAST_CALL controls reachable in short landscape viewports
- Location: e2e/roulette-mobile.spec.ts:823:3

# Error details

```
Error: betArea is clipped: {
  "viewport": {
    "width": 568,
    "height": 320
  },
  "scroll": {
    "clientWidth": 568,
    "scrollWidth": 568,
    "clientHeight": 320,
    "scrollHeight": 320
  },
  "horizontalOverflow": false,
  "bettingCard": {
    "left": 10,
    "right": 558,
    "top": 339.984375,
    "bottom": 1111.359375,
    "width": 548,
    "height": 771.375
  },
  "controls": {
    "betArea": {
      "visible": true,
      "reachable": false,
      "left": 79,
      "right": 212.328125,
      "top": 648.359375,
      "bottom": 670.359375,
      "width": 133.328125,
      "height": 22
    },
    "chip": {
      "visible": true,
      "reachable": false,
      "left": 507,
      "right": 550,
      "top": 533.984375,
      "bottom": 564.984375,
      "width": 43,
      "height": 31
    },
    "undo": {
      "visible": true,
      "reachable": false,
      "left": 507,
      "right": 550,
      "top": 397.984375,
      "bottom": 428.984375,
      "width": 43,
      "height": 31
    },
    "clear": {
      "visible": true,
      "reachable": false,
      "left": 507,
      "right": 550,
      "top": 499.984375,
      "bottom": 530.984375,
      "width": 43,
      "height": 31
    },
    "spin": {
      "visible": true,
      "reachable": false,
      "left": 199,
      "right": 369,
      "top": 1171.859375,
      "bottom": 1341.859375,
      "width": 170,
      "height": 170
    }
  }
}

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - link "Fahrinin Yolu ana menü" [ref=e5] [cursor=pointer]:
      - /url: /
      - generic [ref=e6]: ✦
      - generic [ref=e8]:
        - generic [ref=e9]:
          - text: FAHRİNİN
          - emphasis [ref=e10]: YOLU
        - generic [ref=e11]: FAHRİYİ BEKLEYECEK KADAR SABIRLI MISIN?
  - main [ref=e12]:
    - generic [ref=e13]:
      - link "← ANA MENÜ" [ref=e14] [cursor=pointer]:
        - /url: /
      - generic [ref=e15]:
        - text: THE NIGHT TABLE // EUROPEAN TABLE
        - heading [level=1] [ref=e16]:
          - text: LIGHTNING
          - emphasis [ref=e17]: ROULETTE
      - generic [ref=e18]: CANLI SENKRON
    - region "Round status" [ref=e19]:
      - generic [ref=e20]:
        - text: ROUND
        - strong [ref=e21]: ROUND 000042
      - generic [ref=e22]:
        - text: MASA DURUMU
        - strong [ref=e23]: SON ÇAĞRI
      - generic [ref=e24]:
        - text: SONRAKİ GEÇİŞ
        - strong [ref=e25]: 00:10
      - generic [ref=e26]:
        - text: ROULETTE WALLET
        - strong [ref=e27]: 1.000,00
      - button "Türkçe sesi aç" [ref=e28] [cursor=pointer]: SESİ AÇ
    - region "Son sonuçlar" [ref=e29]:
      - generic [ref=e30]: SON SONUÇLAR
      - generic [ref=e31]: İlk sonuç bekleniyor
    - generic [ref=e33]:
      - region [ref=e34]:
        - heading "Avrupa ruleti çarkı" [level=2] [ref=e35]
        - paragraph [ref=e36]: "Avrupa ruleti sayı sırası: 0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26."
        - status [ref=e37]: Round 000042. Son çağrı, bahisler kapanıyor. Kazanan sayı henüz açıklanmadı.
        - generic [ref=e38]: LIVE EUROPEAN WHEEL
        - generic [ref=e41]:
          - generic "European wheel number order":
            - generic: "0"
            - generic: "32"
            - generic: "15"
            - generic: "19"
            - generic: "4"
            - generic: "21"
            - generic: "2"
            - generic: "25"
            - generic: "17"
            - generic: "34"
            - generic: "6"
            - generic: "27"
            - generic: "13"
            - generic: "36"
            - generic: "11"
            - generic: "30"
            - generic: "8"
            - generic: "23"
            - generic: "10"
            - generic: "5"
            - generic: "24"
            - generic: "16"
            - generic: "33"
            - generic: "1"
            - generic: "20"
            - generic: "14"
            - generic: "31"
            - generic: "9"
            - generic: "22"
            - generic: "18"
            - generic: "29"
            - generic: "7"
            - generic: "28"
            - generic: "12"
            - generic: "35"
            - generic: "3"
            - generic: "26"
      - region "Klasik Avrupa ruleti bahis masası" [ref=e121]:
        - generic "Mobil masa kontrolleri" [ref=e122]:
          - button "Son bahsi geri al" [disabled] [ref=e123] [cursor=pointer]:
            - text: ↶
            - generic [ref=e124]: UNDO
          - button "Son bahsi tekrar et" [ref=e125] [cursor=pointer]:
            - text: ↻
            - generic [ref=e126]: TEKRAR
          - button "Tüm chipleri iki katına çıkar" [disabled] [ref=e127] [cursor=pointer]:
            - text: ×2
            - generic [ref=e128]: İKİLE
          - button "Masadaki tüm bahisleri temizle" [disabled] [ref=e129] [cursor=pointer]:
            - text: ×
            - generic [ref=e130]: TEMİZLE
          - button "Chip seçici" [ref=e131] [cursor=pointer]:
            - text: ◉
            - generic [ref=e132]: CHIP
          - button "Inside bahisleri" [ref=e133] [cursor=pointer]:
            - text: ＋
            - generic [ref=e134]: INSIDE
          - button "Geçmiş sonuçlar" [ref=e135] [cursor=pointer]:
            - text: ◌
            - generic [ref=e136]: GEÇMİŞ
          - button "Adil oyun bilgisi" [ref=e137] [cursor=pointer]:
            - text: ✦
            - generic [ref=e138]: FAIR
          - button "Türkçe sesi aç" [ref=e139] [cursor=pointer]:
            - text: ♫
            - generic [ref=e140]: SES
          - button "Ana menüye dön" [ref=e141] [cursor=pointer]:
            - text: ☰
            - generic [ref=e142]: MENÜ
        - generic [ref=e143]:
          - generic [ref=e144]:
            - generic [ref=e145]: EUROPEAN ROULETTE // 0 + 36 NUMARA
            - strong [ref=e146]: BAHİS MASASI
          - generic [ref=e147]:
            - button "RACETRACK" [ref=e148] [cursor=pointer]
            - button "KOMŞULAR" [ref=e149] [cursor=pointer]
            - button "İÇ BAHİSLER" [ref=e150] [cursor=pointer]
            - button "FAIRNESS" [ref=e151] [cursor=pointer]
            - generic [ref=e152]: KAZANAN SAYIYA GÖRE ÖDEME35:1 STRAIGHT UP
        - generic [ref=e153]:
          - button "0" [ref=e155] [cursor=pointer]
          - generic "Mobil dikey Avrupa ruleti masası" [ref=e157]:
            - generic [ref=e158]:
              - generic [ref=e159]:
                - button "1–18" [ref=e160] [cursor=pointer]
                - button "EVEN" [ref=e162] [cursor=pointer]
                - button "RED" [ref=e164] [cursor=pointer]
                - button "BLACK" [ref=e166] [cursor=pointer]
                - button "ODD" [ref=e168] [cursor=pointer]
                - button "19–36" [ref=e170] [cursor=pointer]
              - generic [ref=e172]:
                - generic [ref=e173]:
                  - button "1" [ref=e174] [cursor=pointer]
                  - button "2" [ref=e176] [cursor=pointer]
                  - button "3" [ref=e178] [cursor=pointer]
                  - button "4" [ref=e180] [cursor=pointer]
                  - button "5" [ref=e182] [cursor=pointer]
                  - button "6" [ref=e184] [cursor=pointer]
                  - button "7" [ref=e186] [cursor=pointer]
                  - button "8" [ref=e188] [cursor=pointer]
                  - button "9" [ref=e190] [cursor=pointer]
                  - button "10" [ref=e192] [cursor=pointer]
                  - button "11" [ref=e194] [cursor=pointer]
                  - button "12" [ref=e196] [cursor=pointer]
                - generic [ref=e198]:
                  - button "13" [ref=e199] [cursor=pointer]
                  - button "14" [ref=e201] [cursor=pointer]
                  - button "15" [ref=e203] [cursor=pointer]
                  - button "16" [ref=e205] [cursor=pointer]
                  - button "17" [ref=e207] [cursor=pointer]
                  - button "18" [ref=e209] [cursor=pointer]
                  - button "19" [ref=e211] [cursor=pointer]
                  - button "20" [ref=e213] [cursor=pointer]
                  - button "21" [ref=e215] [cursor=pointer]
                  - button "22" [ref=e217] [cursor=pointer]
                  - button "23" [ref=e219] [cursor=pointer]
                  - button "24" [ref=e221] [cursor=pointer]
                - generic [ref=e223]:
                  - button "25" [ref=e224] [cursor=pointer]
                  - button "26" [ref=e226] [cursor=pointer]
                  - button "27" [ref=e228] [cursor=pointer]
                  - button "28" [ref=e230] [cursor=pointer]
                  - button "29" [ref=e232] [cursor=pointer]
                  - button "30" [ref=e234] [cursor=pointer]
                  - button "31" [ref=e236] [cursor=pointer]
                  - button "32" [ref=e238] [cursor=pointer]
                  - button "33" [ref=e240] [cursor=pointer]
                  - button "34" [ref=e242] [cursor=pointer]
                  - button "35" [ref=e244] [cursor=pointer]
                  - button "36" [ref=e246] [cursor=pointer]
              - generic [ref=e248]:
                - button "1st 12" [ref=e249] [cursor=pointer]
                - button "2nd 12" [ref=e251] [cursor=pointer]
                - button "3rd 12" [ref=e253] [cursor=pointer]
            - generic [ref=e255]:
              - button "C1" [ref=e256] [cursor=pointer]
              - button "C2" [ref=e258] [cursor=pointer]
              - button "C3" [ref=e260] [cursor=pointer]
        - generic [ref=e262]:
          - generic [ref=e263]:
            - generic [ref=e264]: LUCKY NUMBERS
            - generic [ref=e265]: Sonuçtan sonra açıklanacak
          - generic [ref=e267]:
            - generic [ref=e268]: REVEAL
            - strong [ref=e269]: 0/0
        - generic [ref=e270]:
          - generic [ref=e271]: MULTIPLIER REVEAL
          - generic [ref=e272]: Tek tek reveal bekleniyor
        - generic [ref=e273]:
          - generic [ref=e275]:
            - text: MASADAKİ BAHİS
            - strong [ref=e276]: 0,00
            - generic [ref=e277]: 0 ALAN
          - generic [ref=e278]: Chip seç ve masada bir veya daha fazla alana dokun
        - paragraph [ref=e280]: SON ÇAĞRI // SAYAÇ SIFIRLANINCA MASA KİLİTLENİR
```

# Test source

```ts
  759 |         round: {
  760 |           ...snapshot.round,
  761 |           luckyNumbers: [7, 26],
  762 |           revealedMultipliers,
  763 |           multipliersTotal: 2,
  764 |           nextTransitionAt: new Date(Date.now() + 7_000).toISOString(),
  765 |           version: revealedMultipliers.length,
  766 |         },
  767 |       };
  768 |     };
  769 | 
  770 |     const firstReveal = makeReveal([50]);
  771 |     await fixture.setSnapshot(firstReveal);
  772 |     await fixture.emitSnapshot(firstReveal);
  773 |     await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("MULTIPLIER REVEAL");
  774 |     await expect(page.locator('[data-bet-key="straight:7"]:visible .multiplier-badge')).toHaveText("50x");
  775 |     await expect(page.locator('[data-bet-key="straight:26"]:visible .multiplier-badge')).toHaveCount(1);
  776 | 
  777 |     const secondReveal = makeReveal([50, 500]);
  778 |     await fixture.setSnapshot(secondReveal);
  779 |     await fixture.emitSnapshot(secondReveal);
  780 |     await expect(page.locator('[data-bet-key="straight:26"]:visible .multiplier-badge')).toHaveText("500x");
  781 | 
  782 |     const diagnostics = await page.evaluate(() => {
  783 |       const visibleTarget = (number: number) => Array.from(document.querySelectorAll<HTMLElement>(`[data-bet-key="straight:${number}"]`))
  784 |         .find((element) => {
  785 |           const rect = element.getBoundingClientRect();
  786 |           return rect.width > 0 && rect.height > 0;
  787 |         }) ?? null;
  788 |       const effects = document.querySelector<HTMLElement>("[data-multiplier-effects]");
  789 |       const strike = document.querySelector<HTMLElement>(".multiplier-strike");
  790 |       const impact = document.querySelector<HTMLElement>(".multiplier-impact");
  791 |       const effectRect = effects?.getBoundingClientRect() ?? new DOMRect();
  792 |       const targets = [7, 26].map((number) => {
  793 |         const target = visibleTarget(number);
  794 |         const rect = target?.getBoundingClientRect() ?? new DOMRect();
  795 |         return {
  796 |           number,
  797 |           isMobileTable: target?.closest(".roulette-mobile-table") !== null,
  798 |           withinEffects: rect.left >= effectRect.left
  799 |             && rect.right <= effectRect.right
  800 |             && rect.top >= effectRect.top
  801 |             && rect.bottom <= effectRect.bottom,
  802 |         };
  803 |       });
  804 |       return {
  805 |         targets,
  806 |         horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  807 |         strikeUsesTargetOrigin: Boolean(strike?.style.getPropertyValue("--strike-start-x")),
  808 |         impactUsesTargetCoordinates: Boolean(impact?.style.getPropertyValue("--impact-x")),
  809 |       };
  810 |     });
  811 | 
  812 |     expect(diagnostics.horizontalOverflow).toBe(false);
  813 |     expect(diagnostics.targets).toEqual([
  814 |       { number: 7, isMobileTable: true, withinEffects: true },
  815 |       { number: 26, isMobileTable: true, withinEffects: true },
  816 |     ]);
  817 |     expect(diagnostics.strikeUsesTargetOrigin).toBe(true);
  818 |     expect(diagnostics.impactUsesTargetCoordinates).toBe(true);
  819 |   });
  820 | });
  821 | 
  822 | test.describe("roulette betting controls on rotation", () => {
  823 |   test("keeps OPEN and LAST_CALL controls reachable in short landscape viewports", async ({ page }, testInfo) => {
  824 |     const fixture = await installRouletteFixture(page);
  825 |     const open = makeSnapshot("OPEN", null, new Date().toISOString(), 60_000);
  826 |     const diagnostics: BettingControlDiagnostics[] = [];
  827 |     const landscapeViewports = [
  828 |       { width: 915, height: 412 },
  829 |       { width: 667, height: 375 },
  830 |       { width: 568, height: 320 },
  831 |     ];
  832 | 
  833 |     await fixture.setSnapshot(open);
  834 |     await fixture.emitSnapshot(open);
  835 |     await expect(page.locator(".roulette-page")).toHaveClass(/is-betting-phase/);
  836 | 
  837 |     for (const [index, viewport] of landscapeViewports.entries()) {
  838 |       await page.setViewportSize(viewport);
  839 |       await expect.poll(() => page.evaluate(() => ({
  840 |         orientation: window.matchMedia("(orientation: portrait)").matches ? "portrait" : "landscape",
  841 |         width: window.innerWidth,
  842 |         height: window.innerHeight,
  843 |       }))).toEqual({ orientation: "landscape", ...viewport });
  844 | 
  845 |       if (index === 1) {
  846 |         const lastCall = makeSnapshot("LAST_CALL", null, new Date().toISOString(), 60_000, open.round.id);
  847 |         await fixture.emitSnapshot(lastCall);
  848 |         await expect(page.locator(".roulette-page")).toHaveClass(/is-betting-phase/);
  849 |       }
  850 | 
  851 |       const viewportDiagnostics = await captureBettingControlDiagnostics(page);
  852 |       diagnostics.push(viewportDiagnostics);
  853 |       expect(viewportDiagnostics.horizontalOverflow, JSON.stringify(viewportDiagnostics, null, 2)).toBe(false);
  854 |       expect(viewportDiagnostics.bettingCard.width).toBeLessThanOrEqual(viewport.width);
  855 |       expect(viewportDiagnostics.bettingCard.left).toBeGreaterThanOrEqual(-1);
  856 |       expect(viewportDiagnostics.bettingCard.right).toBeLessThanOrEqual(viewport.width + 1);
  857 |       for (const [name, control] of Object.entries(viewportDiagnostics.controls)) {
  858 |         expect(control.visible, `${name} is not visible: ${JSON.stringify(viewportDiagnostics, null, 2)}`).toBe(true);
> 859 |         expect(control.reachable, `${name} is clipped: ${JSON.stringify(viewportDiagnostics, null, 2)}`).toBe(true);
      |                                                                                                          ^ Error: betArea is clipped: {
  860 |       }
  861 |     }
  862 | 
  863 |     await testInfo.attach("roulette-betting-control-diagnostics", {
  864 |       body: JSON.stringify(diagnostics, null, 2),
  865 |       contentType: "application/json",
  866 |     });
  867 |   });
  868 | });
  869 | 
  870 | test.describe("roulette betting text scaling", () => {
  871 |   test("keeps chip, count, undo, clear, and rebet labels contained in portrait and short landscape", async ({ page }, testInfo) => {
  872 |     const fixture = await installRouletteFixture(page);
  873 |     const open = makeSnapshot("OPEN", null, new Date().toISOString(), 60_000);
  874 |     const diagnostics: BettingTextDiagnostics[] = [];
  875 | 
  876 |     await fixture.setSnapshot(open);
  877 |     await fixture.emitSnapshot(open);
  878 |     await expect(page.locator(".roulette-page")).toHaveClass(/is-betting-phase/);
  879 |     await emulateEnlargedBettingText(page);
  880 | 
  881 |     for (const viewport of [
  882 |       { width: 320, height: 568 },
  883 |       { width: 360, height: 740 },
  884 |       { width: 390, height: 844 },
  885 |       { width: 430, height: 932 },
  886 |       { width: 568, height: 320 },
  887 |     ]) {
  888 |       await page.setViewportSize(viewport);
  889 |       await expect.poll(() => page.evaluate(() => ({
  890 |         width: window.innerWidth,
  891 |         height: window.innerHeight,
  892 |       }))).toEqual(viewport);
  893 | 
  894 |       const viewportDiagnostics = await captureBettingTextDiagnostics(page);
  895 |       diagnostics.push(viewportDiagnostics);
  896 |       expect(viewportDiagnostics.horizontalOverflow, JSON.stringify(viewportDiagnostics, null, 2)).toBe(false);
  897 | 
  898 |       for (const [name, label] of Object.entries(viewportDiagnostics.labels)) {
  899 |         expect(label.visible, `${name} is not visible: ${JSON.stringify(viewportDiagnostics, null, 2)}`).toBe(true);
  900 |         expect(label.contained, `${name} is clipped: ${JSON.stringify(viewportDiagnostics, null, 2)}`).toBe(true);
  901 |         expect(label.text.length, `${name} has no readable label: ${JSON.stringify(viewportDiagnostics, null, 2)}`).toBeGreaterThan(0);
  902 |       }
  903 |       expect(viewportDiagnostics.labels.chip.text).toMatch(/CHIP|100/);
  904 |       expect(viewportDiagnostics.labels.betCount.text).toContain("ALAN");
  905 |       expect(viewportDiagnostics.labels.undo.text).toContain("UNDO");
  906 |       expect(viewportDiagnostics.labels.clear.text).toMatch(/TEMİZLE|CLEAR/);
  907 |       expect(viewportDiagnostics.labels.rebet.text).toContain("TEKRAR");
  908 |     }
  909 | 
  910 |     await testInfo.attach("roulette-betting-text-diagnostics", {
  911 |       body: JSON.stringify(diagnostics, null, 2),
  912 |       contentType: "application/json",
  913 |     });
  914 |   });
  915 | });
  916 | 
  917 | test.describe("roulette betting flow", () => {
  918 |   test("keeps multiple bets, auto-submits once, restores after refresh, and rejects late bets", async ({ page }) => {
  919 |     const fixture = await installRouletteFixture(page);
  920 |     const open = makeSnapshot("OPEN", null, new Date().toISOString(), 3_000);
  921 |     const visibleBet = (key: string) => page.locator(`[data-bet-key="${key}"]:visible`).first();
  922 | 
  923 |     await fixture.setSnapshot(open);
  924 |     await fixture.emitSnapshot(open);
  925 |     await expect(page.locator(".roulette-hud [data-phase]")).toHaveText("BAHİSLER AÇIK");
  926 |     await expect(page.locator("[data-action='bet']")).toHaveCount(0);
  927 | 
  928 |     for (const key of ["straight:7", "straight:17", "straight:22", "red", "dozen:2"]) {
  929 |       await visibleBet(key).click();
  930 |     }
  931 |     await visibleBet("straight:7").click();
  932 |     await expect(page.locator("[data-bet-count]")).toHaveText("5 ALAN");
  933 |     await expect(visibleBet("straight:7").locator(".table-chip")).toHaveText("2,00");
  934 | 
  935 |     await page.locator("[data-action='undo']:visible").first().click();
  936 |     await expect(visibleBet("straight:7").locator(".table-chip")).toHaveText("1,00");
  937 |     await expect(page.locator("[data-bet-count]")).toHaveText("5 ALAN");
  938 | 
  939 |     await expect.poll(() => fixture.postBatches.length, { timeout: 5_000 }).toBe(1);
  940 |     expect(fixture.postBatches[0].bets.map((bet) => `${bet.type}:${bet.numbers.join("-")}`)).toEqual([
  941 |       "STRAIGHT:7",
  942 |       "STRAIGHT:17",
  943 |       "STRAIGHT:22",
  944 |       "RED:1-3-5-7-9-12-14-16-18-19-21-23-25-27-30-32-34-36",
  945 |       "DOZEN:13-14-15-16-17-18-19-20-21-22-23-24",
  946 |     ]);
  947 | 
  948 |     const acceptedBets = fixture.postBatches[0].bets.map((bet) => ({
  949 |       ...bet,
  950 |       status: "ACCEPTED" as const,
  951 |       payoutCents: 0,
  952 |     }));
  953 |     const locked = {
  954 |       ...open,
  955 |       round: {
  956 |         ...open.round,
  957 |         phase: "LOCKED" as const,
  958 |         nextTransitionAt: new Date(Date.now() + 1_000).toISOString(),
  959 |         bets: acceptedBets,
```