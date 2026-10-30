-- 0017 — 3개월권 가격 변경: 189,000원 → 150,000원 (분할 50,000원 × 3회) (2026-10-30 사용자 결정)
--   * 요금제 금액만 바꾸면 소개·가입·마이페이지 화면에 자동 반영된다 (화면은 DB 값을 읽음).
--   * 아직 입금 확인 전인(입금 대기) 3개월권 신청도 새 금액으로 맞춘다. 이미 입금 확인된 회차는 바꾸지 않는다.
-- 0015를 먼저 실행한 뒤 실행. Supabase → SQL Editor → New query → 전체 붙여넣기 → Run. 여러 번 실행해도 안전.
begin;

update public.membership_plans
set price = 150000, installment_amount = 50000
where code = '3m';

-- 입금 대기 중인 3개월권 신청의 미입금 회차를 새 금액으로
update public.membership_payments p
set amount = case when m.payment_option = 'installment' then 50000 else 150000 end
from public.memberships m
where m.id = p.membership_id
  and m.plan_code = '3m'
  and m.status = 'pending'
  and p.status = 'pending';

commit;
