CREATE TABLE scratch_wallets (owner TEXT PRIMARY KEY REFERENCES scratch_actors(id), balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0), updated_at TEXT NOT NULL);
CREATE TABLE scratch_point_events (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES scratch_actors(id), kind TEXT NOT NULL CHECK(kind IN ('DAILY','TAKE','REFUND','REWARD','TRANSFER')), delta INTEGER NOT NULL, reference TEXT NOT NULL, day TEXT, applied INTEGER NOT NULL DEFAULT 0 CHECK(applied IN (0,1)), created_at TEXT NOT NULL);
CREATE UNIQUE INDEX scratch_daily_once ON scratch_point_events(owner,day) WHERE kind='DAILY';
CREATE INDEX scratch_points_owner ON scratch_point_events(owner,created_at);
INSERT INTO scratch_wallets (owner,balance,updated_at) SELECT a.id,COALESCE(SUM(l.units),0),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM scratch_actors a LEFT JOIN scratch_tickets t ON t.owner=a.id LEFT JOIN scratch_ledger l ON l.ticket_id=t.id GROUP BY a.id;
INSERT INTO scratch_point_events (id,owner,kind,delta,reference,applied,created_at) SELECT 'reward:'||t.id,t.owner,'REWARD',l.units,t.serial,1,l.created_at FROM scratch_ledger l JOIN scratch_tickets t ON t.id=l.ticket_id;
INSERT INTO scratch_point_events (id,owner,kind,delta,reference,applied,created_at) SELECT 'take:'||id,owner,'TAKE',0,'旧版免费领票',1,created_at FROM scratch_orders;
CREATE TRIGGER scratch_points_immutable BEFORE UPDATE OF owner,kind,delta,reference,day,created_at ON scratch_point_events BEGIN SELECT RAISE(ABORT,'Immutable point event'); END;
