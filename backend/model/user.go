package model

import "time"

type UserStatus string
type User struct {
	ID           uint64     `json:"id,string" gorm:"primaryKey;autoIncrement;check:ck_users_id,id > 0"`
	Name         string     `json:"name" gorm:"not null;check:ck_users_name,char_length(name) BETWEEN 1 AND 50"`
	Email        string     `json:"email" gorm:"not null;uniqueIndex:uq_users_email;check:ck_users_email,char_length(email) <= 254"`
	PasswordHash string     `json:"-" gorm:"not null"`
	Status       UserStatus `json:"-" gorm:"not null;default:active;check:ck_users_status,status IN ('active', 'deleting')"`
	TokenVersion uint64     `json:"-" gorm:"not null;default:0;check:ck_users_token_version,token_version >= 0"`
	CreatedAt    time.Time  `json:"created_at" gorm:"not null;autoCreateTime:false"`
	UpdatedAt    time.Time  `json:"updated_at" gorm:"not null;autoUpdateTime:false"`
}
