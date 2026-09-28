let localAudioStream = null;
let isMicActive = false;

// ฟังก์ชันเปิด/ปิด ไมโครโฟน
async function toggleMicrophone() {
    const mainMicBtn = document.getElementById('mainMicBtn');
    const micStatusText = document.getElementById('micStatusText');
    const myMicIcon = document.getElementById('myMicIcon');

    if (!isMicActive) {
        try {
            localAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            isMicActive = true;
            mainMicBtn.classList.remove('off');
            mainMicBtn.classList.add('on');
            micStatusText.textContent = "ACTIVE MICROPHONE";
            micStatusText.style.color = "#e74c3c";
            myMicIcon.textContent = "🔊";
            myMicIcon.classList.remove('off');
            myMicIcon.classList.add('on');
        } catch (error) {
            alert("กรุณาอนุญาตการเข้าถึงไมโครโฟนบนเบราว์เซอร์");
        }
    } else {
        if (localAudioStream) {
            localAudioStream.getTracks().forEach(track => track.stop());
        }
        isMicActive = false;
        mainMicBtn.classList.remove('on');
        mainMicBtn.classList.add('off');
        micStatusText.textContent = "MICROPHONE MUTED";
        micStatusText.style.color = "#888";
        myMicIcon.textContent = "🔇";
        myMicIcon.classList.remove('on');
        myMicIcon.classList.add('off');
    }
}

// ฟังก์ชันใช้การ์ดว่าจ้าง 3 ใบเพื่อยึดนักธุรกิจ
function useRecruitment3Cards() {
    const select = document.getElementById('selectInvestor');
    const selectedInvestorCode = select.value;
    const ownerElement = document.getElementById(`owner-${selectedInvestorCode}`);

    if (ownerElement && select.selectedIndex !== -1) {
        // เปลี่ยนเจ้าของนักธุรกิจการ์ดนั้นเป็น คุณ (Player 3)
        ownerElement.textContent = "เจ้าของ: คุณ (Player 3)";
        ownerElement.className = "inv-owner my-card";
        
        // ลบตัวเลือกออกจากเมนู dropdown
        select.remove(select.selectedIndex);

        alert(`🤝 คุณใช้การ์ดว่าจ้าง 3 ใบสำเร็จ! ได้รับ Investor ${selectedInvestorCode} มาเป็นของคุณเรียบร้อยแล้ว`);
    }
}